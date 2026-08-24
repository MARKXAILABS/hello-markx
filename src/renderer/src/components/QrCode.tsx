// The vendored encoder is imported RELATIVELY, never through this renderer's
// usual `@/` alias: test/load-ts.cjs's loader (`resolveTs`) resolves relative
// and `@shared/` imports only, so an alias import here would make this
// component untestable under `node --test` and its only behavioural test
// would stop existing (02-10-PLAN.md interface note 5).
import { qrcodegen } from '../vendor/qrcodegen';

export interface QrCodeProps {
  /** The full payload to encode — the pairing link, in this app's one use. */
  text: string;
  /** Edge length in CSS px (square). Default 180 (02-UI-SPEC.md §S4b). */
  size?: number;
}

/**
 * QrCode — a module matrix turned into one inline `<svg>` of rects on a
 * literal white plate. The matrix comes from the vendored
 * `src/renderer/src/vendor/qrcodegen.ts` (Project Nayuki, MIT); this
 * component owns the SVG, which upstream deliberately does not provide.
 */
export function QrCode({ text, size = 180 }: QrCodeProps) {
  let qr: qrcodegen.QrCode;
  try {
    qr = qrcodegen.QrCode.encodeText(text, qrcodegen.QrCode.Ecc.MEDIUM);
  } catch {
    // Unreachable, not unhandled. The host this payload is built from arrives
    // over a child process's stdout (a trust boundary) — see QrCode's only
    // caller in SettingsModal.tsx. The encoder's byte-mode ceiling at Ecc M
    // is thousands of characters; the real payload is `https://` + a
    // <=63-char host + `/phone/#` + a 43-char base64url token — roughly 120
    // characters, an order of magnitude inside the ceiling. This guard
    // exists so a malformed host degrades the QR to nothing rather than
    // crashing the renderer tree around it.
    return null;
  }

  const n = qr.size;
  const dim = n + 8; // 4-module quiet zone on every side, inside the viewBox
  const rects: React.ReactElement[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.getModule(x, y)) {
        rects.push(
          <rect key={`${x}-${y}`} x={x + 4} y={y + 4} width={1} height={1} fill="var(--cth-ink-900)" />
        );
      }
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${dim} ${dim}`}
      role="img"
      aria-label="Pairing QR code for the phone"
      style={{ display: 'block', padding: 'var(--cth-space-2)' }}
    >
      {/* A literal #FFFFFF, deliberately — never the theme's paper surface
          token. In dark mode every surface token goes near-black, and a
          dark-on-dark QR is a code that does not scan; the failure is
          silent, and the operator's only symptom is a phone that will not
          pair. */}
      <rect x={0} y={0} width={dim} height={dim} fill="#FFFFFF" />
      {rects}
    </svg>
  );
}
