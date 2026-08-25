import { useEffect, useRef, useState } from 'react';
import { PixelButton } from './PixelButton';
import { Icon } from './Icon';
import type { BlockReason } from '@/store/store';

export interface BlockedBannerProps {
  reason: BlockReason;
  onAction: (label: string, send?: string) => void;
}

/**
 * GATE-05 rule G-3's format table, and every branch of it is load-bearing.
 *
 * EXPORTED, and for a measured reason rather than a stylistic one. This is the one part
 * of the approval surface that is a pure function of a number, and the renderer harness
 * is a server render with no effect phase at all (`test/renderer-components.test.cjs:23-38`)
 * — so extracting it is what turns "five rendered states" from something an operator
 * eyeballs at a checkpoint into five assertions that run on every future PR. Same seam
 * and same argument as `useHive.ts`'s `blockReasonFromApproval` and `CommandCenterPanel`'s
 * `rosterBadgeStatus`.
 *
 * Below ten seconds NO NUMBER is shown: the last ten seconds are the window where clock
 * skew and transit latency could lie, and a number that lies there tells the operator
 * they have time to answer a question that has already auto-denied.
 *
 * THE FOURTH BAND DIFFERS FROM THE PHONE ON PURPOSE. `resources/phone/index.html`
 * renders `expiring`; this renders `expiring — will deny`. The desktop has the width for
 * the half of the sentence that says what the timeout DOES, and at 3am that is the half
 * that matters. `test/build-assets.test.cjs` asserts the other three bands byte-identical
 * across the two implementations and asserts this one as a deliberate divergence — the
 * desktop string must `startsWith` the phone's, with the remainder exactly ` — will deny`
 * — so neither side can drift and nobody can "align" them by deleting the suffix.
 *
 * `escalate` is the ≤30s threshold, and it drives three channels at once in the render
 * below: the ink level, the weight, and the wording. Never the colour alone (DESIGN.md:707).
 */
export function formatRemaining(ms: number): { text: string; escalate: boolean } {
  if (!(ms > 0)) return { text: 'expired', escalate: true };
  if (ms < 10_000) return { text: 'expiring — will deny', escalate: true };
  const escalate = ms <= 30_000;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return { text: `${secs}s left`, escalate };
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return { text: `${m}m ${s < 10 ? '0' : ''}${s}s left`, escalate };
}

/** What the screen reader hears, and ONLY at the two thresholds (rule A7). The live
 *  region's content is empty above 30s and changes exactly twice, so a countdown that
 *  re-renders every second announces nothing per second. */
function thresholdAnnouncement(ms: number): string {
  if (!(ms > 0)) return 'The approval request expired and was denied.';
  if (ms < 10_000) return 'Expiring — this request will be denied.';
  if (ms <= 30_000) return '30 seconds left to answer.';
  return '';
}

export function BlockedBanner({ reason, onAction }: BlockedBannerProps) {
  const { askId, expiresInMs, receivedAt, outcome } = reason;
  // An ask that has already resolved is not counting down any more: `expiring — will
  // deny` beside `approved` is a sentence the operator has to reconcile at 3am.
  const counting = askId !== undefined && outcome === undefined;

  // Re-DERIVED from the anchor on every tick, NEVER decremented. A backgrounded window
  // throttles intervals, and a decremented counter then drifts arbitrarily far in the
  // optimistic direction — the one direction that is unsafe. `now` is the only state.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!counting) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [counting, askId]);

  const remaining = receivedAt !== undefined && expiresInMs !== undefined
    ? receivedAt + expiresInMs - now
    : 0;
  const countdown = formatRemaining(remaining);

  // A9.2 — resolution unmounts the button the operator is standing on, dropping focus to
  // <body>. Focus moves to `dismiss` in the same render, GUARDED on the resolution having
  // come from a click in this banner: an ask answered on the phone or expired on its own
  // must not yank focus out of whatever the operator is typing into.
  const rootRef = useRef<HTMLDivElement>(null);
  const answeredHere = useRef(false);
  useEffect(() => {
    if (outcome === undefined || !answeredHere.current) return;
    answeredHere.current = false;
    // ponytail: after the swap `actions` is empty, so the banner's ONLY button is the
    // `dismiss` fallback below. PixelButton takes no ref and belongs to another plan
    // (D-35), so the node is reached through the root rather than by forwarding one.
    rootRef.current?.querySelector('button')?.focus();
  }, [outcome]);

  return (
    <div ref={rootRef} style={{
      background: 'var(--cth-coral-light)',
      boxShadow: 'inset 0 0 0 1.5px var(--cth-ink-500), inset 0 0 0 4px var(--cth-coral)',
      padding: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontFamily: 'var(--cth-font-display)',
        fontSize: 'var(--cth-text-display-md)', lineHeight: 'var(--cth-lh-display-md)',
        color: 'var(--cth-ink-900)',
        textTransform: 'uppercase'
      }}>
        <Icon name="bell" /> needs you
      </div>
      <div style={{
        fontFamily: 'var(--cth-font-ui)',
        fontSize: 16,
        lineHeight: '20px',
        color: 'var(--cth-ink-900)'
      }}>
        {reason.summary}
      </div>
      <div style={{
        fontSize: 'var(--cth-text-body-md)',
        lineHeight: 'var(--cth-lh-body-md)',
        color: 'var(--cth-ink-700)'
      }}>
        {reason.detail}
      </div>
      {reason.command && (
        <div
          // Rule 3 — a command UNDER APPROVAL may never be ellipsised.
          // `git push origin +main --force` truncated to `git push origin +ma…` hides the
          // dangerous half, and the dangerous half is frequently at the end. It wraps,
          // breaks inside an unbroken token, caps at 96px and scrolls.
          //
          // A GATE-03 notice keeps today's ellipsis — that command already did NOT run,
          // so the row is a record rather than a decision — and gains the `title` plan
          // 04-14 deferred here, so the truncated half is one hover away instead of
          // readable only in the terminal feed.
          title={askId === undefined ? reason.command : undefined}
          style={{
            fontFamily: 'var(--cth-font-mono)',
            fontSize: 'var(--cth-text-mono-md)',
            lineHeight: 'var(--cth-lh-mono)',
            color: 'var(--cth-ink-900)',
            background: 'var(--cth-paper-100)',
            padding: '4px 8px',
            boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)',
            ...(askId !== undefined
              ? { whiteSpace: 'pre-wrap' as const, wordBreak: 'break-all' as const, maxHeight: 96, overflowY: 'auto' as const }
              : { whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' })
          }}
        >
          $ {reason.command}
        </div>
      )}
      {/* Rule 4 — resolution replaces the action row; the banner does NOT vanish. A
          banner that silently disappears leaves the operator unable to tell whether they
          approved something (T-04-ASK-24). `actions` is emptied by the caller, so the
          `dismiss` fallback below already renders on exactly this condition. */}
      {outcome !== undefined && (
        <div style={{
          fontSize: 'var(--cth-text-body-md)',
          lineHeight: 'var(--cth-lh-body-md)',
          color: 'var(--cth-ink-900)',
          fontWeight: 600
        }}>
          {outcome}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {reason.actions.map((a) => (
          <PixelButton
            key={a.label}
            variant={a.kind === 'approve' ? 'primary' : a.kind === 'deny' ? 'destructive' : 'secondary'}
            size="sm"
            onClick={() => {
              // Only a click INSIDE the banner arms the focus move above.
              answeredHere.current = true;
              onAction(a.label, a.send);
            }}
          >
            {a.label}
          </PixelButton>
        ))}
        {/* A banner with no buttons would be un-closable. Not hypothetical: the
            operator-gated-tool reason raised from useHive carries `actions: []`
            because there is nothing to answer — the call was already denied and
            the agent kept running, so this is a notice, not a prompt. It still
            has to be dismissable, and the callers' onAction already clears the
            reason whether or not there are keystrokes to send. It is ALSO the
            resolved-ask control (rule 4), which needs no new JSX for the swap. */}
        {reason.actions.length === 0 && (
          <PixelButton variant="secondary" size="sm" onClick={() => onAction('dismiss')}>
            dismiss
          </PixelButton>
        )}
        {counting && (
          <span style={{
            marginLeft: 'auto',
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 'var(--cth-text-body-md)', lineHeight: 'var(--cth-lh-body-md)',
            // Rule 1 — escalate on the INK ramp, never to coral. `--cth-coral` on this
            // banner's `--cth-coral-light` fill measures 2.43:1 in light mode (FAIL);
            // ink-700 is 8.89:1 / 6.47:1 and ink-900 is 12.96:1 / 10.13:1, both PASS.
            // A countdown that becomes unreadable exactly when it matters is the defect
            // that measurement exists to prevent.
            color: countdown.escalate ? 'var(--cth-ink-900)' : 'var(--cth-ink-700)',
            fontWeight: countdown.escalate ? 600 : 400
          }}>
            <Icon name="clock" /> {countdown.text}
          </span>
        )}
      </div>
      {/* Rule A7 — announced at the 30s and 10s thresholds only, never per second. The
          region's text is EMPTY above 30s and changes exactly twice on the way down, so
          a span that re-renders every second still floods nothing. */}
      {counting && (
        <span aria-live="polite" style={{
          position: 'absolute', width: 1, height: 1, overflow: 'hidden',
          clipPath: 'inset(50%)', whiteSpace: 'nowrap'
        }}>
          {thresholdAnnouncement(remaining)}
        </span>
      )}
    </div>
  );
}
