import { useStore } from '@/store/store';
import { inferAgentProvider, providerPreset } from '@/store/config';

/**
 * DAY — SCALE-03's replay surface (03-UI-SPEC §S1). A wall-clock 24h density band
 * over one day's `events` + `cost-ledger` rows, read through `hive:timeline`.
 *
 * ── WHY AN SVG AND NOT PIXI ─────────────────────────────────────────────────
 * D-28 refuses a second WebGL context here on a measured bug: `glRecovery.ts:9-18`
 * records Chromium's ~16-context cap with the OLDEST evicted first, the office
 * floor's context is created at startup and is therefore always first out, and
 * Pixi reports nothing when it happens. `OfficeFloor.tsx` stays the only
 * `new Application()` in the renderer. This band is one `<svg>` of `<rect>`s with
 * `role="img"` + `aria-label`, copying `QrCode.tsx:50-67` exactly.
 *
 * ── WHY THE DATA CAN ARRIVE AS A PROP ───────────────────────────────────────
 * The production mount passes NO props: it fetches through `window.cth`. The
 * optional `summary` / `bucket` / `day` props exist so `renderToStaticMarkup`
 * (which runs no effects and commits no state) can drive the data-dependent
 * branches — the counts, the gap sentences, the truncation line and, above all,
 * the `ok:false` branch, which is otherwise unreachable from a first render and
 * is the one state that must never render as a quiet day.
 *
 * ── ONE SENTENCE, ONE CONSTANT ──────────────────────────────────────────────
 * Every declared sentence below is a single-line constant used by BOTH the DOM
 * and the SVG's accessible name, so a sighted and a screen-reader operator can
 * never be told different things about the same day.
 */

/** Both channels answer `{ok:true,…}` or `{ok:false,error}` on EVERY path —
 *  success, rejected argument and store-unavailable alike. Derived from the
 *  preload bridge rather than re-typed, so a change there is a type error here
 *  and not a silently-wrong render (the `WorkersTab.tsx:14` idiom). */
type TimelineResult = Awaited<ReturnType<typeof window.cth.hiveTimeline>>;
type BucketDetailResult = Awaited<ReturnType<typeof window.cth.hiveTimelineBucket>>;
type BucketSummary = Extract<TimelineResult, { ok: true }>['buckets'][number];

const BUCKETS_PER_DAY = 96;
const BUCKET_MINUTES = 15;
const BUCKET_MS = BUCKET_MINUTES * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Track height in viewBox units. 8·3 tracks + 2 one-unit gaps = the 26-unit
 *  viewBox; at `height: 104` that is 32px a track and 4px a gap, all on the
 *  4-grid `DESIGN.md` asks for. */
const TRACK_UNITS = 8;
const TRACK_PITCH = TRACK_UNITS + 1;
const BAND_UNITS = TRACK_PITCH * 3 - 1;

// ─── The declared sentences (03-UI-SPEC §S1e, Empty states :228-231, Error states :247)

/** UI-SPEC :247, the BINDING "Timeline query failed" row. It names no channel, so
 *  it binds the day query and the bucket query alike. The reason is part of the
 *  VISIBLE sentence, never a `title` alone: Chromium does not reliably expose a
 *  title on a non-interactive element, so a reason that lives only there is a
 *  reason the operator never receives. */
const timelineError = (reason: string): string => `Could not read the timeline: ${reason}. Pick the day again to retry.`;
/** UI-SPEC :231 — no `events` rows exist at all (fresh install / pre-migration). */
const NO_TIMELINE_YET = 'No timeline yet — the record starts the first time the floor logs an event.';
/** UI-SPEC :228 — the whole viewed day predates the stored record. A claim about the STORE. */
const nothingRecorded = (date: string, firstDate: string): string => `Nothing was recorded on ${date}. The stored record starts ${firstDate}.`;
/** UI-SPEC :229 — the record covers this day and it held no rows. A claim about the FLOOR. */
const wasQuiet = (date: string): string => `${date} was quiet. The floor recorded nothing that day.`;
/** UI-SPEC §S1e — the record starts partway INTO the viewed day. */
const noRecordBefore = (hhmm: string): string => `No record before ${hhmm} — missing, not quiet.`;
/** UI-SPEC §S1e — buckets after the current time, on today only. */
const REST_OF_TODAY = 'The rest of today has not happened yet.';
/** UI-SPEC §S1e's `title`. The last clause is load-bearing: the band genuinely
 *  cannot tell "never written" from "rotated out", and claiming either is a
 *  fabrication. */
const recordStartsTitle = (date: string, hhmm: string): string => `The stored record for ${date} starts at ${hhmm}. Hours before that were never written or have since been rotated out — the floor cannot tell you which.`;
/** This plan's own sentence — no UI-SPEC row can express it without fabricating.
 *  `eventsAgedOut` is main's flag for "the events table cannot speak to this day
 *  at all, but the never-rotated cost ledger still has its spend": the retention
 *  case, and far more commonly a just-migrated install whose ledger is months
 *  deeper than its events table. Saying "Nothing was recorded" here would be a
 *  denial printed directly above the cost bars drawn from the same response. */
const eventsAgedOutSentence = (date: string): string => `No events are stored for ${date} — they were never written or have aged out of the record. The cost track below still has that day's spend.`;
/** D-35 on a new surface, tier 1: the engine reports no spend at all. Reuses the
 *  app's existing `no cost meter` vocabulary (UI-SPEC :233) rather than inventing. */
const noCostMeterGap = (n: number): string => `${n} agent(s) on this floor report no cost meter — spend for those agents never reaches this track.`;
/** D-35 tier 2, and it is NOT the same gap. A `costTracking:'transcript'` engine's
 *  spend IS measured and its card shows it — `boot.ts`'s `if (sample?.sessionId)`
 *  append gate is what stops it reaching the ledger this track is drawn from.
 *  That is 03-CONTEXT's first Accepted Residual; merging it into the sentence
 *  above would name the wrong gap and send the operator to the wrong fix. */
const transcriptOnlyGap = (n: number): string => `${n} agent(s) report spend only from their own transcripts — that spend never reaches the cost ledger this track is drawn from.`;

// ─── local-date helpers ──────────────────────────────────────────────────────

const two = (n: number): string => String(n).padStart(2, '0');

/** `'YYYY-MM-DD'` for a local timestamp — the exact form a native `<input
 *  type="date">` produces and the only form `parseDayParam` accepts. */
function isoDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** LOCAL midnight for a `'YYYY-MM-DD'` day — the same resolution `timeline.ts`
 *  performs main-side, so the renderer's bucket arithmetic lands where main's did. */
function localDayStart(day: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return NaN;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

/** `firstTs`'s time of day WITHIN the day it falls in — never a raw offset from
 *  the viewed day's midnight, which is how a whole-store timestamp ends up
 *  printed as a wrong o'clock on the wrong day. */
const clockOf = (ms: number): string => `${two(new Date(ms).getHours())}:${two(new Date(ms).getMinutes())}`;

/** Four decimals below a cent, deliberately: rounding real spend down to `$0.00`
 *  is the silent zero D-35 forbids — a beat that cost $0.0004 did cost something. */
function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  return n !== 0 && Math.abs(n) < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

// ─── the three tracks (§S1b) ─────────────────────────────────────────────────

/** D-26: `envelopes` is a FILTER of the same `events` rows (`kind === 'message'`),
 *  not a second source — every envelope is also counted in the events track. */
const TRACKS: { key: string; label: string; fill: string; value: (b: BucketSummary) => number }[] = [
  { key: 'events', label: 'events', fill: 'var(--cth-ink-700)', value: (b) => b.events },
  { key: 'envelopes', label: 'envelopes', fill: 'var(--cth-sky)', value: (b) => b.envelopes },
  { key: 'cost', label: 'cost', fill: 'var(--cth-lemon)', value: (b) => b.usd }
];

/** One declared sentence, with the optional full explanation §S1e's terse-visible /
 *  full-`title` pattern puts behind a tooltip. */
interface Declaration { text: string; title?: string }

/** What the band must SAY about this day, and which columns it must not draw as
 *  ordinary silence. Pure — the whole gap-cause table lives here so the markup
 *  below has no branching left to get wrong. */
function declareDay(
  summary: Extract<TimelineResult, { ok: true }>,
  day: string,
  now: number
): { declarations: Declaration[]; missingBefore: number; unlivedFrom: number; costTrackIsReal: boolean } {
  const dayStart = localDayStart(day);
  const declarations: Declaration[] = [];
  let missingBefore = 0;
  let costTrackIsReal = true;

  const total = (pick: (b: BucketSummary) => number): number => summary.buckets.reduce((s, b) => s + pick(b), 0);

  // The order is the contract. `eventsAgedOut` OUTRANKS both no-record causes:
  // when it is set the day HAS spend, so neither "Nothing was recorded" nor "No
  // timeline yet" is true, and the cost track is real data drawn normally.
  if (summary.eventsAgedOut) {
    declarations.push({ text: eventsAgedOutSentence(day) });
    missingBefore = BUCKETS_PER_DAY;
    costTrackIsReal = true;
  } else if (summary.firstTs === null) {
    declarations.push({ text: NO_TIMELINE_YET });
    missingBefore = BUCKETS_PER_DAY;
  } else if (summary.firstTs >= dayStart + DAY_MS) {
    // The record's earliest data is on a LATER calendar day than this one, so the
    // whole viewed day predates the record. "Quiet" would be a fabricated claim of
    // genuine silence about a day the floor may well have spent busy.
    declarations.push({ text: nothingRecorded(day, isoDay(summary.firstTs)) });
    missingBefore = BUCKETS_PER_DAY;
  } else if (summary.firstTs >= dayStart) {
    const hhmm = clockOf(summary.firstTs);
    missingBefore = Math.floor((summary.firstTs - dayStart) / BUCKET_MS);
    declarations.push({ text: noRecordBefore(hhmm), title: recordStartsTitle(day, hhmm) });
  } else if (total((b) => b.events) === 0 && total((b) => b.envelopes) === 0 && total((b) => b.usd) === 0) {
    // The record already started before this day, so the store CAN speak to all of
    // it — and it says nothing happened. That is the one branch where "quiet" is
    // a claim the data actually supports.
    declarations.push({ text: wasQuiet(day) });
  }

  // Independent of every cause above, and of each other. Today's unlived hours are
  // not a hole in the record; they are hours that have not happened.
  const unlivedFrom = day === isoDay(now) && Number.isFinite(dayStart)
    ? Math.min(BUCKETS_PER_DAY, Math.floor((now - dayStart) / BUCKET_MS) + 1)
    : BUCKETS_PER_DAY;
  if (unlivedFrom < BUCKETS_PER_DAY) declarations.push({ text: REST_OF_TODAY });

  return { declarations, missingBefore, unlivedFrom, costTrackIsReal };
}

export function DayBandTab({ summary, day: dayProp }: {
  /** The FULL discriminated result, not just its success half — a test injects
   *  `{ok:false, error}` as readily as a payload. `undefined` is the production
   *  default and means "fetch it yourself". */
  summary?: TimelineResult | null;
  /** Test seam only; production never passes it and defaults to today. */
  day?: string;
}) {
  const agents = useStore((s) => s.agents);
  const day = dayProp ?? isoDay(Date.now());

  // The roster is already in the renderer — no new IPC call for a fact the store
  // has had all along. Two counts, not one: `'none'` engines have no meter at all,
  // `'transcript'` engines have a meter whose output never reaches the ledger.
  const tiers = agents.filter((a) => !a.archived)
    .map((a) => providerPreset(inferAgentProvider(a.command, a.provider)).costTracking);
  const noMeterCount = tiers.filter((t) => t === 'none').length;
  const transcriptCount = tiers.filter((t) => t === 'transcript').length;
  const costGaps: Declaration[] = [];
  if (noMeterCount >= 1) costGaps.push({ text: noCostMeterGap(noMeterCount) });
  if (transcriptCount >= 1) costGaps.push({ text: transcriptOnlyGap(transcriptCount) });

  // ── `ok` is the FIRST thing branched on, before any count or gap-cause logic ──
  // There is no zeroed-success path to fall back on: main answers `{ok:false}` for
  // a rejected day, a rejected bucket index AND a store that is not open. Rendering
  // any of those as an empty band would report a broken query as a silent floor.
  if (summary && summary.ok === false) {
    const sentence = timelineError(summary.error);
    return (
      <Shell day={day}>
        <Band label={`Activity for ${day}: ${sentence}`} buckets={null} missingBefore={BUCKETS_PER_DAY} unlivedFrom={BUCKETS_PER_DAY} costTrackIsReal={false} costGapWash={false} />
        <Axis />
        <Legend />
        <Declarations items={[{ text: sentence }]} />
      </Shell>
    );
  }

  // Not an error — the pre-fetch state, which asserts NOTHING. No counts exist yet,
  // so the accessible name carries the day and `aria-busy` rather than a fabricated
  // "0 events, 0 envelopes, $0.00", and no empty-state sentence is claimed.
  if (!summary) {
    return (
      <Shell day={day}>
        <Band label={`Activity for ${day}`} buckets={null} missingBefore={0} unlivedFrom={BUCKETS_PER_DAY} costTrackIsReal costGapWash={false} busy />
        <Axis />
        <Legend />
      </Shell>
    );
  }

  const { declarations, missingBefore, unlivedFrom, costTrackIsReal } = declareDay(summary, day, Date.now());
  const events = summary.buckets.reduce((s, b) => s + b.events, 0);
  const envelopes = summary.buckets.reduce((s, b) => s + b.envelopes, 0);
  const usd = summary.buckets.reduce((s, b) => s + b.usd, 0);
  const items = [...declarations, ...costGaps];

  // One string, appended verbatim (§S1b, UI-SPEC :462) — a screen-reader user gets
  // the SAME declaration a sighted one gets, from the SAME constants.
  const label = [
    `Activity for ${day}: ${events} events, ${envelopes} envelopes, ${fmtUsd(usd)} across ${BUCKETS_PER_DAY} fifteen-minute buckets.`,
    ...items.map((d) => d.text)
  ].join(' ');

  return (
    <Shell day={day}>
      <Band
        label={label} buckets={summary.buckets}
        missingBefore={missingBefore} unlivedFrom={unlivedFrom}
        costTrackIsReal={costTrackIsReal} costGapWash={costGaps.length > 0}
      />
      <Axis />
      <Legend />
      <Declarations items={items} />
    </Shell>
  );
}

function Shell({ day, children }: { day: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px 16px', overflow: 'auto', minWidth: 0 }}>
      <div style={{ fontFamily: 'var(--cth-font-ui)', fontSize: 'var(--cth-text-body-md)', lineHeight: 'var(--cth-lh-body-md)', color: 'var(--cth-ink-700)' }}>
        {day}
      </div>
      {children}
    </div>
  );
}

/** The band itself. `preserveAspectRatio="none"` is deliberate — x is time and y is
 *  magnitude, two unrelated quantities that must not be locked to one ratio — and
 *  `shapeRendering="crispEdges"` is what keeps the rect edges on the device pixel
 *  grid under that scaling (the mechanism `Icon.tsx` already uses). */
function Band({ label, buckets, missingBefore, unlivedFrom, costTrackIsReal, costGapWash, busy = false }: {
  label: string;
  buckets: BucketSummary[] | null;
  missingBefore: number;
  unlivedFrom: number;
  costTrackIsReal: boolean;
  costGapWash: boolean;
  busy?: boolean;
}) {
  const rects: React.ReactElement[] = [];
  TRACKS.forEach((track, ti) => {
    const top = ti * TRACK_PITCH;
    const isCostTrack = track.key === 'cost';

    // The declared-gap wash for the cost track sits BEHIND the bars: a floor with a
    // no-meter engine can still have real spend from its metered ones, and erasing
    // those bars would trade one silent zero for another.
    if (isCostTrack && costGapWash) {
      rects.push(<rect key="cost-wash" x={0} y={top} width={BUCKETS_PER_DAY} height={TRACK_UNITS} fill="var(--cth-ink-100)" />);
    }

    // Gap fill, in one rect per run rather than 96: same pixels, a 96th of the DOM.
    // `eventsAgedOut` fills only the events and envelope tracks — the cost track is
    // real data on that day and is drawn normally.
    const gapsThisTrack = isCostTrack && !costTrackIsReal ? BUCKETS_PER_DAY : (isCostTrack ? 0 : missingBefore);
    if (gapsThisTrack > 0) {
      rects.push(<rect key={`gap-${track.key}`} x={0} y={top} width={gapsThisTrack} height={TRACK_UNITS} fill="var(--cth-ink-100)" />);
    }
    if (unlivedFrom < BUCKETS_PER_DAY) {
      rects.push(<rect key={`unlived-${track.key}`} x={unlivedFrom} y={top} width={BUCKETS_PER_DAY - unlivedFrom} height={TRACK_UNITS} fill="var(--cth-ink-100)" />);
    }

    if (!buckets) return;
    // Quantised bar height, never opacity: DESIGN.md §3.6 bans gradients on every
    // surface but the title bar, and an opacity ramp is a gradient by another name.
    // Zero draws nothing.
    const max = buckets.reduce((m, b) => Math.max(m, track.value(b)), 0);
    if (max <= 0) return;
    buckets.forEach((b, i) => {
      const v = track.value(b);
      if (!(v > 0)) return;
      const h = Math.min(TRACK_UNITS, Math.ceil(TRACK_UNITS * v / max));
      rects.push(<rect key={`${track.key}-${i}`} x={i} y={top + TRACK_UNITS - h} width={1} height={h} fill={track.fill} />);
    });
  });

  return (
    <svg
      role="img"
      aria-label={label}
      aria-busy={busy || undefined}
      viewBox={`0 0 ${BUCKETS_PER_DAY} ${BAND_UNITS}`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      style={{ display: 'block', width: '100%', height: 104 }}
    >
      <rect x={0} y={0} width={BUCKETS_PER_DAY} height={BAND_UNITS} fill="var(--cth-cream-200)" />
      {rects}
    </svg>
  );
}

/** Axis labels are DOM, not SVG (§S1b) — so they stay selectable and scale with the
 *  operator's own text size instead of with `preserveAspectRatio="none"`. */
function Axis() {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      fontFamily: 'var(--cth-font-ui)', fontSize: 'var(--cth-text-body-sm)',
      lineHeight: 'var(--cth-lh-body-sm)', color: 'var(--cth-ink-500)'
    }}>
      {['00', '06', '12', '18', '24'].map((h) => <span key={h}>{h}</span>)}
    </div>
  );
}

function Legend() {
  return (
    <div style={{ display: 'flex', gap: 14, fontFamily: 'var(--cth-font-ui)', fontSize: 'var(--cth-text-body-sm)', lineHeight: 'var(--cth-lh-body-sm)', color: 'var(--cth-ink-500)' }}>
      {TRACKS.map((t) => (
        <span key={t.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--cth-space-2)' }}>
          {/* Rule 0 — decorative swatch. The word beside it carries the meaning. */}
          <span aria-hidden="true" style={{ width: 8, height: 8, background: t.fill, flexShrink: 0 }} />
          {t.label}
        </span>
      ))}
    </div>
  );
}

/** Every declaration that applies, each its own sentence. They are never collapsed
 *  into one string: the causes are different and so are the remedies. */
function Declarations({ items }: { items: Declaration[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {items.map((d) => (
        <p key={d.text} title={d.title} style={{
          margin: 0, fontFamily: 'var(--cth-font-ui)', fontSize: 'var(--cth-text-body-md)',
          lineHeight: 'var(--cth-lh-body-md)', color: 'var(--cth-ink-700)'
        }}>{d.text}</p>
      ))}
    </div>
  );
}

// Referenced so the bucket-detail contract stays type-checked alongside the band it
// belongs to; the list that consumes it lands in the same file.
export type { BucketDetailResult };
