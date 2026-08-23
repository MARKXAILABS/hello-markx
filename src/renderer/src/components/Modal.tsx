import { CSSProperties, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { PixelPanel } from './PixelPanel';
import { PixelButton } from './PixelButton';

/**
 * The one dialog primitive (DESIGN.md §7.10).
 *
 * Every modal in the app was a hand-rolled backdrop <div> with an onClick:
 * no `role`, no focus trap, no focus restore, and on Add Agent a stray backdrop
 * click silently threw away an eleven-field form. Owning all of it here means a
 * new dialog gets the behaviour for free instead of re-deriving three quarters
 * of it:
 *
 *   - `role="dialog"` + `aria-modal`, with the title as the accessible name.
 *   - Tab / Shift+Tab cycle INSIDE the dialog; focus lands in it at open and
 *     returns to whatever opened it at close.
 *   - Escape closes the TOP dialog only — Add Agent opened over the fullscreen
 *     terminal must not close both. Capture phase + stopImmediatePropagation is
 *     what keeps the fullscreen view's own window-level Escape from firing too.
 *   - `guardUnsaved` turns a backdrop click / Escape into a discard prompt once
 *     the user has typed into the dialog. Dirtiness is observed from the
 *     dialog's own input/change events rather than threaded through eleven
 *     `useState` setters at the call site.
 */

/** Open dialogs, innermost last. Only the last one answers Escape. */
const openDialogs: object[] = [];

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function focusablesIn(root: HTMLElement): HTMLElement[] {
  // offsetParent is null for anything display:none'd — a sectioned form keeps
  // its hidden sections mounted, and tabbing into one would read as the trap
  // having dropped focus into nowhere.
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
}

export interface ModalProps {
  /** Shown in the title bar AND used as the dialog's accessible name. */
  title: string;
  onClose: () => void;
  /** Refuse every dismissal — an irreversible operation is mid-flight. */
  locked?: boolean;
  /** Ask before discarding once the user has typed into the dialog. */
  guardUnsaved?: boolean;
  /** Backdrop tint. Defaults to the DESIGN.md §7.10 ink-900 @ 70%, no blur. */
  backdrop?: string;
  /** Stacking order (the fullscreen terminal/file overlays sit at 250/280). */
  zIndex?: number;
  width?: number | string;
  maxWidth?: string;
  /** Extra styles for the frame — the sized box that holds the panel. */
  frameStyle?: CSSProperties;
  /** Extra styles for the PixelPanel itself. */
  panelStyle?: CSSProperties;
  children: ReactNode;
}

export function Modal({
  title,
  onClose,
  locked = false,
  guardUnsaved = false,
  backdrop = 'rgba(26, 19, 32, 0.7)',
  zIndex = 300,
  width = 480,
  maxWidth = '92vw',
  frameStyle,
  panelStyle,
  children
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const token = useRef<object>({});
  const dirty = useRef(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const requestClose = useCallback(() => {
    if (locked) return;
    if (guardUnsaved && dirty.current) { setConfirmDiscard(true); return; }
    onClose();
  }, [locked, guardUnsaved, onClose]);

  // Register + focus + restore. The opener is read before the first focus()
  // below moves it.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const self = token.current;
    openDialogs.push(self);
    const el = dialogRef.current;
    (el ? focusablesIn(el)[0] ?? el : null)?.focus();
    return () => {
      const i = openDialogs.indexOf(self);
      if (i >= 0) openDialogs.splice(i, 1);
      // isConnected: the opener may have been unmounted while the dialog was up
      // (a card that spawned it and then disappeared). Focusing a detached node
      // just drops focus on <body>, so skip it rather than pretend.
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  // Escape, top dialog only.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (openDialogs[openDialogs.length - 1] !== token.current) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (confirmDiscard) setConfirmDiscard(false); // back out of the prompt, keep the form
      else requestClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [requestClose, confirmDiscard]);

  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const el = dialogRef.current;
    if (!el) return;
    const items = focusablesIn(el);
    if (items.length === 0) { e.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === el)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <div
      // mousedown, not click: a text selection that starts inside the dialog and
      // ends over the backdrop fires `click` on the backdrop, which used to
      // close the dialog. Checking the target here also retires the
      // stopPropagation() every call site needed on its inner div.
      onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}
      style={{
        position: 'fixed', inset: 0,
        background: backdrop,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={trapTab}
        onInput={guardUnsaved ? () => { dirty.current = true; } : undefined}
        onChange={guardUnsaved ? () => { dirty.current = true; } : undefined}
        style={{ width, maxWidth, outline: 'none', position: 'relative', ...frameStyle }}
      >
        <PixelPanel variant="dialog" title={title} noPadding style={panelStyle}>
          {/* §7.10: always a close button top-right. It is also the first stop
              in the tab cycle, so Tab-then-Enter always gets a user out. */}
          <button
            type="button"
            onClick={requestClose}
            disabled={locked}
            aria-label={`Close ${title.toLowerCase()}`}
            title="Close"
            style={{
              position: 'absolute', top: 2, right: 4,
              width: 24, height: 24,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none',
              cursor: locked ? 'default' : 'pointer',
              color: 'var(--cth-ink-900)',
              fontFamily: 'var(--cth-font-display)', fontSize: 'var(--cth-text-display-md)', lineHeight: 'var(--cth-lh-display-md)',
              opacity: locked ? 0.4 : 1
            }}
          >
            ✕
          </button>
          {children}
        </PixelPanel>

        {confirmDiscard && (
          <div
            style={{
              position: 'absolute', inset: 0,
              background: 'rgba(26, 19, 32, 0.55)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
            }}
          >
            <div style={{
              background: 'var(--cth-cream-50)',
              boxShadow: 'var(--cth-panel-border-dialog)',
              padding: 16, maxWidth: 380,
              display: 'flex', flexDirection: 'column', gap: 12
            }}>
              <div style={{ fontSize: 14, lineHeight: '20px', color: 'var(--cth-ink-900)' }}>
                You have unsaved changes in this dialog. Close it and lose them?
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <PixelButton variant="secondary" size="md" onClick={() => setConfirmDiscard(false)}>
                  keep editing
                </PixelButton>
                <PixelButton variant="destructive" size="md" onClick={onClose}>
                  discard
                </PixelButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
