import { useEffect, useState } from 'react';
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
 * Pixi reports nothing when it happens. `OfficeFloor.tsx` stays the only place in
 * the renderer that constructs a Pixi `Application`, and the acceptance grep for
 * that constructor over THIS file must read zero — including in prose, which is
 * why this sentence does not spell it out. The band is one `<svg>` of `<rect>`s with
 * `role="img"` + `aria-label`, copying `QrCode.tsx:50-67` exactly. No windowing
 * library either, and none is needed: 96 columns is a fixed, tiny DOM and the
 * detail list is one bucket deep, capped main-side at 200 rows.
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
 *  it binds the day query and the bucket query alike — one constant, both call
 *  sites. The reason is part of the VISIBLE sentence, never a `title` alone:
 *  Chromium does not reliably expose a title on a non-interactive element, so a
 *  reason that lives only there is a reason the operator never receives. */
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
/** UI-SPEC :230 — the bucket resolved and held nothing. Its own rendered branch,
 *  which is what makes "an unreadable bucket never renders as an empty one"
 *  falsifiable instead of true by construction. */
const EMPTY_BUCKET = 'Nothing in this fifteen minutes.';
/** UI-SPEC §S1f. Both halves come from main verbatim; this file counts nothing. */
const truncatedLine = (shown: number, total: number): string => `Showing ${shown} of ${total} rows in this bucket.`;
/** UI-SPEC §S1f — the standing limitation, in the UI and not only in a comment.
 *  `hive.ts:1668` records a subject and no body at all, so the list offers no
 *  "read body" affordance and says why. */
const ENVELOPE_NOTE = 'Envelopes show their subject. The body was never recorded.';

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
const clockSecOf = (ms: number): string => `${clockOf(ms)}:${two(new Date(ms).getSeconds())}`;

/** A bucket edge as NOMINAL wall clock, derived from the index rather than from
 *  `startMs`. ponytail: on a DST-transition day the nominal label and the real
 *  offset diverge for part of the day; this is a wall-clock axis, so the nominal
 *  label is the one that matches what the operator reads off it. Derive from
 *  `startMs` instead if a transition day ever needs to be exact. */
const bucketEdge = (i: number): string => `${two(Math.floor((i * BUCKET_MINUTES) / 60))}:${two((i * BUCKET_MINUTES) % 60)}`;

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
  const costTrackIsReal = true;

  const total = (pick: (b: BucketSummary) => number): number => summary.buckets.reduce((s, b) => s + pick(b), 0);

  // The order is the contract. `eventsAgedOut` OUTRANKS both no-record causes:
  // when it is set the day HAS spend, so neither "Nothing was recorded" nor "No
  // timeline yet" is true, and the cost track is real data drawn normally.
  if (summary.eventsAgedOut) {
    declarations.push({ text: eventsAgedOutSentence(day) });
    missingBefore = BUCKETS_PER_DAY;
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

export function DayBandTab({ summary: summaryProp, bucket: bucketProp, day: dayProp }: {
  /** The FULL discriminated result, not just its success half — a test injects
   *  `{ok:false, error}` as readily as a payload. `undefined` is the production
   *  default and means "fetch it yourself". */
  summary?: TimelineResult | null;
  /** The selected bucket AND its detail, same seam and same reason. */
  bucket?: { index: number; detail: BucketDetailResult } | null;
  /** Test seam only; production never passes it and defaults to today. */
  day?: string;
}) {
  const agents = useStore((s) => s.agents);
  const [dayState, setDayState] = useState(() => dayProp ?? isoDay(Date.now()));
  const [selectedState, setSelectedState] = useState(0);
  const [fetchedSummary, setFetchedSummary] = useState<TimelineResult | null>(null);
  const [fetchedDetail, setFetchedDetail] = useState<BucketDetailResult | null>(null);

  const day = dayProp ?? dayState;
  const selected = bucketProp ? bucketProp.index : selectedState;
  const summary = summaryProp !== undefined ? summaryProp : fetchedSummary;
  const detail = bucketProp !== undefined ? (bucketProp ? bucketProp.detail : null) : fetchedDetail;

  // PRODUCTION path. Skipped entirely when the caller supplied the data, so the
  // injected-prop path and the live-fetch path share one set of rendering code and
  // differ only in where the payload came from.
  useEffect(() => {
    if (summaryProp !== undefined) return undefined;
    let live = true;
    window.cth.hiveTimeline(day)
      .then((r) => { if (live) setFetchedSummary(r); })
      // A rejected invoke is a failed timeline query like any other. Swallowing it
      // would render a broken channel as a quiet day, which is the whole defect the
      // one-shape contract exists to prevent.
      .catch((e: unknown) => { if (live) setFetchedSummary({ ok: false, error: e instanceof Error ? e.message : String(e) }); });
    return () => { live = false; };
  }, [day, summaryProp]);

  useEffect(() => {
    if (bucketProp !== undefined) return undefined;
    let live = true;
    // Cleared first: one bucket's rows at a time is the bound that keeps a whole
    // day out of the renderer, and a stale list under a new selection is a lie.
    setFetchedDetail(null);
    window.cth.hiveTimelineBucket(day, selected)
      .then((r) => { if (live) setFetchedDetail(r); })
      .catch((e: unknown) => { if (live) setFetchedDetail({ ok: false, error: e instanceof Error ? e.message : String(e) }); });
    return () => { live = false; };
  }, [day, selected, bucketProp]);

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

  // ── `ok` is branched on BEFORE any count or gap-cause logic ──────────────────
  // There is no zeroed-success path to fall back on: main answers `{ok:false}` for
  // a rejected day, a rejected bucket index AND a store that is not open. Rendering
  // any of those as an empty band would report a broken query as a silent floor.
  const failed = summary && summary.ok === false ? timelineError(summary.error) : null;
  const ok = summary && summary.ok === true ? summary : null;
  const declared = ok ? declareDay(ok, day, Date.now()) : null;

  const events = ok ? ok.buckets.reduce((s, b) => s + b.events, 0) : 0;
  const envelopes = ok ? ok.buckets.reduce((s, b) => s + b.envelopes, 0) : 0;
  const usd = ok ? ok.buckets.reduce((s, b) => s + b.usd, 0) : 0;
  const items: Declaration[] = failed
    ? [{ text: failed }]
    : ok ? [...(declared?.declarations ?? []), ...costGaps] : [];

  // One string, appended verbatim (§S1b) — a screen-reader user gets the SAME
  // declaration a sighted one gets, from the SAME constants. On the failure branch
  // the counts are unknowable, so the label carries the prefix and the SAME error
  // sentence: a label reading "0 events, 0 envelopes, $0.00" would be the identical
  // fabrication in ARIA form, and a reason-stripped one strands the screen-reader
  // user with a problem and no cause.
  const label = failed
    ? `Activity for ${day}: ${failed}`
    : ok
      ? [`Activity for ${day}: ${events} events, ${envelopes} envelopes, ${fmtUsd(usd)} across ${BUCKETS_PER_DAY} fifteen-minute buckets.`, ...items.map((d) => d.text)].join(' ')
      // The pre-fetch state asserts NOTHING. No counts exist yet, so the name carries
      // the day and `aria-busy` — never a fabricated zero, never an empty-state claim.
      : `Activity for ${day}`;

  const cell = ok?.buckets[selected];
  const window24 = `${bucketEdge(selected)}–${bucketEdge(selected + 1)}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px 16px', overflow: 'auto', minWidth: 0 }}>
      {/* The picker renders on EVERY branch, including the failure one: the error
          sentence's remedy is literally "Pick the day again to retry", and an
          instruction whose control is off screen cannot be followed. No `min`
          either (S1d) — a disabled range HIDES when the record starts, and stating
          that is the whole job of the empty-state copy. */}
      <input
        type="date"
        aria-label="Day to replay"
        value={day}
        max={isoDay(Date.now())}
        onChange={(e) => { setDayState(e.target.value); setSelectedState(0); }}
        style={{
          alignSelf: 'flex-start', padding: '3px 6px', background: 'var(--cth-paper-100)',
          border: 'none', boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)',
          fontFamily: 'var(--cth-font-mono)', fontSize: 'var(--cth-text-mono-md)',
          lineHeight: 'var(--cth-lh-mono)', color: 'var(--cth-ink-900)'
        }}
      />

      <Band
        label={label} buckets={ok?.buckets ?? null} selected={selected} busy={!summary}
        missingBefore={failed ? BUCKETS_PER_DAY : declared?.missingBefore ?? 0}
        unlivedFrom={declared?.unlivedFrom ?? BUCKETS_PER_DAY}
        costTrackIsReal={failed ? false : declared?.costTrackIsReal ?? true}
        costGapWash={costGaps.length > 0}
      />
      <Axis />
      <Legend />

      {/* Native range input. Arrow keys step one bucket and Home/End jump to the
          ends — all free, and none of it needs a glyph button (D-25). Disabled
          while there are no counts to announce, which is exactly what S1c's own
          `:disabled::-webkit-slider-thumb` rule is for. */}
      <input
        className="cth-scrub"
        type="range" min="0" max={String(BUCKETS_PER_DAY - 1)} step="1"
        value={selected}
        disabled={!cell}
        aria-label="Time of day"
        aria-valuetext={cell
          ? `${window24} · ${cell.events} events · ${cell.envelopes} envelopes · ${fmtUsd(cell.usd)}`
          : window24}
        onChange={(e) => setSelectedState(Number(e.target.value))}
      />

      <Declarations items={items} />

      {!failed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--cth-font-display)', fontSize: 'var(--cth-text-display-md)',
            lineHeight: 'var(--cth-lh-display-md)', color: 'var(--cth-ink-500)'
          }}>{window24}</div>
          <p style={{
            margin: 0, fontFamily: 'var(--cth-font-ui)', fontSize: 'var(--cth-text-body-sm)',
            lineHeight: 'var(--cth-lh-body-sm)', color: 'var(--cth-ink-500)'
          }}>{ENVELOPE_NOTE}</p>
          <DetailList detail={detail} nameOf={(id) => agents.find((a) => a.id === id)?.name ?? id ?? 'unattributed'} />
        </div>
      )}
    </div>
  );
}

/** The band itself. `preserveAspectRatio="none"` is deliberate — x is time and y is
 *  magnitude, two unrelated quantities that must not be locked to one ratio — and
 *  `shapeRendering="crispEdges"` is what keeps the rect edges on the device pixel
 *  grid under that scaling (the mechanism `Icon.tsx` already uses). */
function Band({ label, buckets, selected, missingBefore, unlivedFrom, costTrackIsReal, costGapWash, busy = false }: {
  label: string;
  buckets: BucketSummary[] | null;
  selected: number;
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
    const gapsThisTrack = isCostTrack ? (costTrackIsReal ? 0 : BUCKETS_PER_DAY) : missingBefore;
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
      {/* The selection, spanning all three tracks. Load-bearing: the 24px thumb covers
          roughly six buckets on a ~400px track, so the thumb alone cannot show which
          one is selected. `non-scaling-stroke` because preserveAspectRatio="none"
          would otherwise stretch the outline into two different widths. */}
      <rect
        x={selected} y={0} width={1} height={BAND_UNITS}
        fill="none" stroke="var(--cth-ink-900)" strokeWidth={1} vectorEffect="non-scaling-stroke"
      />
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

// ─── the merged detail list (§S1f) ───────────────────────────────────────────

const isRecord = (u: unknown): u is Record<string, unknown> => typeof u === 'object' && u !== null;

/** `appendEvent(kind, json, ts)` is handed the WHOLE hive log row as `json`, so the
 *  fields `fmtActivityRow` reads live inside it rather than on the detail row. */
function parseEntry(json: unknown): Record<string, unknown> {
  if (typeof json !== 'string' || json === '') return {};
  try {
    const v: unknown = JSON.parse(json);
    return isRecord(v) ? v : {};
  } catch {
    return {};
  }
}

/**
 * `ActivityTab`'s five switch cases, COPIED VERBATIM (the `fmt` closure inside
 * `ActivityTab`, `CommandCenterPanel.tsx`). Not imported: `CommandCenterPanel`
 * imports THIS file, and a cycle back would leave one of the two bindings
 * `undefined` at module-init under the CJS loader the tests use. The copy is kept
 * honest by a parity test that lifts BOTH bodies out of BOTH real sources and
 * compares them — the same technique `shippedRelAge` already uses for `WorkersTab`'s
 * formatter, and it goes red the day either side is edited alone.
 *
 * `cost` is deliberately NOT here: it does not exist in `ActivityTab`'s switch, and
 * adding a cumulative-vs-diff cost line to that live tail would be ADR-0005's bug in
 * a second place. It gets its own branch below.
 */
function fmtActivityRow(e: Record<string, unknown>): string {
  switch (e.kind) {
    case 'spawn': return `spawned ${e.name ?? e.agentId}`;
    case 'message': return `${e.from} → ${e.to}: ${e.subject || e.act}`;
    case 'drain': return `${e.agentId} drained ${e.count} msg(s)`;
    case 'escalate': return `escalated to human: ${e.subject ?? ''}`;
    case 'approval': return `approval ${e.approve ? 'granted' : 'denied'}`;
    default: return JSON.stringify(e);
  }
}

/** One row's three columns. The preload bridge types `rows` as `unknown[]`, so the
 *  shape is narrowed HERE — at the trust boundary — rather than assumed. Nothing is
 *  ever DROPPED: a row this cannot read still renders, because `shown` must equal
 *  what main counted or the truncation line's two halves disagree. */
function rowParts(raw: unknown, nameOf: (id: string | null) => string): { time: string; kind: string; text: string } {
  if (!isRecord(raw)) return { time: '', kind: '·', text: String(raw) };
  const ts = typeof raw.ts === 'number' ? raw.ts : NaN;
  const time = Number.isFinite(ts) ? clockSecOf(ts) : '';
  if (raw.type === 'cost') {
    // D-22: the clamped consecutive DIFF, which is what main already returns — never
    // a cumulative snapshot. Zero-delta rows never arrive here: 03-03 drops them
    // before its 200-row cap and computes `total` after, so this file filters nothing.
    const spend = typeof raw.usd === 'number' ? raw.usd : 0;
    return { time, kind: 'cost', text: `${nameOf(typeof raw.agentId === 'string' ? raw.agentId : null)} +$${spend.toFixed(4)}` };
  }
  const kind = typeof raw.kind === 'string' ? raw.kind : '·';
  return { time, kind, text: fmtActivityRow({ ...parseEntry(raw.json), kind }) };
}

function DetailList({ detail, nameOf }: { detail: BucketDetailResult | null; nameOf: (id: string | null) => string }) {
  // Not fetched yet. Asserts nothing — an empty-bucket claim here would be a claim
  // about a query that has not answered.
  if (!detail) return null;

  // Checked before the list, exactly as the day summary's `ok` is: an unreadable
  // bucket must never render as an empty one, for the same reason a rejected day
  // must never render as a quiet one. Same constant, so the two cannot drift.
  if (detail.ok === false) return <Note>{timelineError(detail.error)}</Note>;
  if (detail.rows.length === 0) return <Note>{EMPTY_BUCKET}</Note>;

  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      {detail.rows.map((raw, i) => {
        const { time, kind, text } = rowParts(raw, nameOf);
        return (
          <li key={i} style={{ display: 'flex', gap: 8, minWidth: 0 }}>
            <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 'var(--cth-text-mono-sm)', lineHeight: 'var(--cth-lh-mono)', color: 'var(--cth-ink-500)', flexShrink: 0 }}>{time}</span>
            {/* ink-500, NOT ActivityTab's ink-300: measured 2.19:1 on this band's
                cream-200 plate against 5.26:1 here. Copying the existing treatment
                would newly specify inherited drift onto a new surface. */}
            <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 'var(--cth-text-mono-sm)', lineHeight: 'var(--cth-lh-mono)', color: 'var(--cth-ink-500)', flexShrink: 0 }}>{kind}</span>
            <span style={{ fontFamily: 'var(--cth-font-ui)', fontSize: 'var(--cth-text-body-md)', lineHeight: 'var(--cth-lh-body-md)', color: 'var(--cth-ink-700)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
          </li>
        );
      })}
      {/* Both numbers straight from main. This file counts nothing and filters
          nothing, so `shown` and `total` can never disagree about what a row is. */}
      {detail.truncated && (
        <li style={{ fontFamily: 'var(--cth-font-ui)', fontSize: 'var(--cth-text-body-sm)', lineHeight: 'var(--cth-lh-body-sm)', color: 'var(--cth-ink-500)', paddingTop: 4 }}>
          {truncatedLine(detail.rows.length, detail.total)}
        </li>
      )}
    </ol>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      margin: 0, fontFamily: 'var(--cth-font-ui)', fontSize: 'var(--cth-text-body-md)',
      lineHeight: 'var(--cth-lh-body-md)', color: 'var(--cth-ink-700)'
    }}>{children}</p>
  );
}
