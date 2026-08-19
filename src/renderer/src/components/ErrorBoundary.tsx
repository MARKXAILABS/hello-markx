/**
 * The one thing standing between a throwing panel and a white window.
 *
 * When a render throws and nothing catches it, React unmounts the WHOLE tree —
 * the floor, the roster, the terminals, all of it — and the user is left staring
 * at a blank window with no way back except quitting the app. That is not
 * theoretical here: a malformed ledger card did exactly that once, which is why
 * TasksKanban.tsx now normalises every card at the point of use.
 *
 * A boundary is React's only mechanism for this, and it only exists as a class.
 * Two of them go around the two big independent regions — the floor and the
 * sidebar — so a panel that throws takes down its own half and leaves the other
 * half, plus the title bar and the agent strip, still usable.
 *
 * Deliberately NOT a crash-reporting surface: it names what broke, offers a
 * retry, and puts the stack on the console where devtools can find it. There is
 * no crash pipeline to send it anywhere yet (#13).
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { PixelButton } from './PixelButton';

export interface ErrorBoundaryProps {
  /** Names the region in the fallback, so the user can say WHICH half died. */
  label: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The console is the only sink we have, and it is the one place a devtools
    // session will look. The component stack is the useful half — the error
    // alone rarely says which panel it came from.
    console.error(`[${this.props.label}] render crashed:`, error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{
        height: '100%',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 10, padding: 16,
        background: 'var(--cth-coral-light)',
        boxShadow: 'inset 0 0 0 1px var(--cth-coral)'
      }}>
        <div style={{
          fontFamily: 'var(--cth-font-display)', fontSize: 10, lineHeight: '14px',
          color: 'var(--cth-ink-900)', textTransform: 'uppercase', textAlign: 'center'
        }}>{this.props.label} crashed</div>
        <p style={{
          margin: 0, maxWidth: 320, textAlign: 'center',
          fontFamily: 'var(--cth-font-mono)', fontSize: 12, lineHeight: '18px',
          color: 'var(--cth-ink-700)',
          overflowWrap: 'anywhere'
        }}>{error.message || String(error)}</p>
        <p style={{
          margin: 0, maxWidth: 320, textAlign: 'center',
          fontSize: 12, lineHeight: '18px', color: 'var(--cth-ink-700)'
        }}>
          The rest of the office is still running. Full stack in the devtools console.
        </p>
        {/* Retry just clears the flag and re-renders the same children. If the
            cause is still there it throws again and lands right back here —
            which is the honest outcome, and costs nothing to offer for the far
            more common case of a transient bad value that has since moved on. */}
        <PixelButton variant="secondary" size="sm" onClick={() => this.setState({ error: null })}>
          try again
        </PixelButton>
      </div>
    );
  }
}
