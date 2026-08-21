import { useState, useSyncExternalStore } from 'react';
import { PixelPanel } from './PixelPanel';
import { PixelBadge, StatusKind } from './PixelBadge';
import { useHasTerminalDraft } from './terminalPool';
import { SpritePortrait } from './SpritePortrait';
import { RealtimeMichaelToggle } from './RealtimeMichaelToggle';
import { CostHud } from '@/realtime/CostHud';
import { AccentColorName } from '@/design/tokens';
import { OfficeCharacterName } from '@/scene/office/cast';
import { useStore } from '@/store/store';
import { agentRowForCard, isAutoModeAgent, getLiveAutoMode, subscribeLiveAutoMode } from '@/store/autoMode';
import { shortModel } from './FullscreenTerminal';

export interface AgentCardProps {
  name: string;
  character: OfficeCharacterName;
  accent: AccentColorName;
  status: StatusKind;
  /** This agent's pty, if it has one. Only used to notice that the USER has
   *  unsent text on its prompt — which holds the agent's queue, and otherwise
   *  looks identical to an idle agent with nothing to do. */
  ptyId?: string;
  project: string;
  action?: string;
  /** Context gauge: 0..8 segments filled (session context ÷ context limit). */
  progress?: number;
  /** Live context size (tokens) — shown in the gauge tooltip. */
  contextTokens?: number;
  /** Context-window limit (tokens) assumed for the agent's model. */
  contextLimit?: number;
  selected?: boolean;
  /** Your clone — gets a persistent accent frame + BOSS tag so it stands out.
   *  (`isGod` / the `god` agent id stay as-is internally; this is display only.) */
  isGod?: boolean;
  onClick?: () => void;
  /** Number of ledger tasks this agent is actively DOING — rendered as a blue
   *  sticky note stuck to the card. Clicking it opens the first task's detail. */
  doingCount?: number;
  onTaskNoteClick?: () => void;
  /** Marks the card itself draggable. Chromium will not start a drag on an
   *  ancestor when the pointer is over a form control, so the card root carries
   *  it rather than the strip's wrapper alone. */
  draggable?: boolean;
  /** Private note — rendered as the card's own row (v0.3.4) so it can never
   *  cover the context gauge. First line only; full text in the tooltip. */
  note?: string;
  /** Opens the note editor (the strip owns the editing overlay). When set, the
   *  card shows a small ✎ affordance on its note row. */
  onEditNote?: () => void;
  /** Claude pool-account LABEL this agent is pinned to (resolved by the strip);
   *  unset = /login account (no chip — cards look exactly as before the pool). */
  accountLabel?: string;
  /** Estimated USD burned by this agent so far (OTel telemetry). The one number
   *  a user asks about first and the one none of the four agent renderings
   *  showed, though useFleetTelemetry has carried it per agent all along. */
  usd?: number;
}

const fmtK = (n: number): string => `${Math.round(n / 1000)}k`;

/**
 * v0.3.4 compact redesign: one identity row (name + status), one context line
 * (action while working, repo while idle — both in the tooltip), one note row,
 * and a slim gauge pinned to the bottom edge. Nothing overlaps anything.
 */
export function AgentCard({
  name, character, accent, status, ptyId, project, action, progress = 0,
  contextTokens, contextLimit, selected, isGod, onClick,
  doingCount = 0, onTaskNoteClick, draggable, note, onEditNote, accountLabel, usd
}: AgentCardProps) {
  const [hover, setHover] = useState(false);
  const typing = useHasTerminalDraft(ptyId);
  // IDENTITY and SELECTION are two different things, and conflating them is why
  // selecting Michael appeared to do nothing.
  //
  // The card used to pass `isGod || selected` into PixelPanel's 'active' variant,
  // whose frame is `inset 1px + 3px accent + 5px ink` — five pixels of border in
  // the agent's OWN accent. Three problems in one: the selection cue changed
  // colour per agent (the "blue halo" on a sky agent), it was invisible on god
  // because god was framed unconditionally, and stacking the selection ring
  // outside it made the boss card visibly fatter than its neighbours.
  //
  // Now: god is marked by its SURFACE (see godSurface), everyone shares the same
  // 1px panel border, and selection is one accent-independent ring — identical on
  // every card, god included.

  // The selected card wears an ink ring OUTSIDE its border. ink-900 rather than
  // an accent so the cue is identical on every agent, and it flips with the
  // theme (near-black on cream, near-white on the dark ground), staying legible
  // over whatever accent the card already carries.
  const selectionRing = selected ? '0 0 0 2px var(--cth-ink-900)' : '';

  // Context gauge as ONE clean fill (0..8 → 0..100%). Colour escalates as the
  // window fills: accent while comfortable, amber from 6/8, coral from 7/8.
  const pct = Math.min(8, Math.max(0, progress)) / 8 * 100;
  const gaugeColor = progress >= 7 ? 'var(--cth-coral)'
    : progress >= 6 ? 'var(--cth-lemon)'
      : `var(--cth-${accent})`;
  const gaugeTitle = contextTokens !== undefined && contextLimit
    ? `Context: ${fmtK(contextTokens)} / ${fmtK(contextLimit)} tokens (${Math.round((contextTokens / contextLimit) * 100)}%)`
    : 'Context gauge — fills once the agent reports activity';

  // ONE card size for every agent. God used to be 216x86 against everyone
  // else's 196x76, so the dock never lined up — and once the selection ring was
  // added outside its 5px accent frame, the boss card grew a visibly thicker
  // edge than any other. Distinction now comes from the card's SURFACE, not from
  // making its box bigger or its border heavier.
  // 196 was too tight once god's row carried NAME + BOSS + status: the name
  // truncated to "MIC…" — the one word on the card that must never be the thing
  // that gets cut. Widened for every card so the dock stays uniform, with enough
  // slack that Talk's info mark (which only appears when the OpenAI key is
  // missing) has somewhere to sit rather than pushing the row apart.
  const width = 220;
  const height = 78;
  const lift = (isGod ? -2 : 0) - (hover ? 1 : 0) - (selected ? 1 : 0);
  /** God's distinction: a tinted surface plus a thin accent border all the way
   *  around — NOT the 3px rule that used to sit on the top edge alone. That rule
   *  read as a stray yellow bar rather than as part of the card, and an edge
   *  treatment that only exists on one side always looks like a mistake or a
   *  progress bar. Same 1px geometry as every other card, so the box is
   *  unchanged and the selection ring still means exactly one thing everywhere. */
  const godSurface: React.CSSProperties = isGod
    ? {
        background: `var(--cth-${accent}-light)`,
        boxShadow: `inset 0 0 0 1px var(--cth-${accent})`
      }
    : {};
  const dropShadow = isGod
    ? `2px 3px 0 0 rgba(26,19,32,${hover ? 0.2 : 0.14})`
    : (hover ? '1px 2px 0 0 rgba(26,19,32,0.12)' : 'none');
  // Ring first so it sits tight to the card, then the existing drop shadow.
  const outerShadow = [selectionRing, dropShadow === 'none' ? '' : dropShadow]
    .filter(Boolean).join(', ') || 'none';

  // One context line: what it's DOING while working, WHERE it lives while idle.
  const infoLine = (status !== 'idle' && action) ? action : project;
  const noteFirstLine = (note ?? '').split('\n').find((l) => l.trim()) ?? '';

  // FLOOR-01 - does this agent act without asking for tool approval?
  //
  // The card is presentational: it is handed display props, never an agent id,
  // and provider/command/model live on the store row. So it resolves its own row
  // the same way useHasTerminalDraft above already keys off ptyId, and calls the
  // ONE shared derivation the fullscreen roster row and the command-centre row
  // also call. Three copies of a safety rule are three chances to start lying.
  const row = useStore((s) => agentRowForCard(s.agents, ptyId, name));
  const liveAutoMode = useSyncExternalStore(subscribeLiveAutoMode, getLiveAutoMode, getLiveAutoMode);
  const autoMode = isAutoModeAgent(row?.provider, row?.command, liveAutoMode);

  return (
    // A <div role="button">, not a <button>. The card carries THREE other
    // controls inside it — the task sticky note, the ✎ note editor, and (on
    // god) the voice toggle + cost readout — and interactive content inside a
    // <button> is invalid HTML: the parser closes the outer button early, and
    // screen readers flatten everything into one unusable control. The role +
    // tabIndex + Enter/Space handler below give the card the same keyboard
    // behaviour a real button had, while the controls inside stay real buttons.
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return; // a nested control is handling it
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      draggable={draggable}
      // An aria-label on this container REPLACES all inner text for a screen
      // reader, so the AUTO chip below is silent unless the state is folded in
      // here. The chip is aria-hidden for the same reason: announced once, here.
      aria-label={`${name}${isGod ? ' (boss)' : ''} — ${status}${autoMode ? ` — Auto mode — ${name} runs with permissions bypassed` : ''}`}
      // The ring is the visual answer to "which terminal is open"; this is the
      // same answer for a screen reader. Matches SidebarRow in fullscreen.
      aria-current={selected ? 'true' : undefined}
      className="cth-titlebar-nodrag"
      style={{
        width, minWidth: width, height,
        padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left',
        position: 'relative',
        transform: lift ? `translateY(${lift}px)` : 'none',
        boxShadow: outerShadow,
        transition: 'transform 90ms steps(2, end), box-shadow 90ms steps(2, end)'
      }}
    >
      {/* The taken note, stuck to the card like on the desk: this worker is
          actively DOING a ledger task. Click → the task's detail overlay. */}
      {doingCount > 0 && (
        <button
          type="button"
          title={`actively working ${doingCount} task${doingCount === 1 ? '' : 's'} — click to open`}
          aria-label={`Open ${name}'s active task${doingCount === 1 ? '' : 's'} (${doingCount})`}
          onClick={(e) => { e.stopPropagation(); onTaskNoteClick?.(); }}
          style={{
            position: 'absolute', right: -4, bottom: -5, zIndex: 2,
            border: 'none', padding: 0,
            width: 20, height: 18,
            background: 'var(--cth-sky)',
            boxShadow: 'inset 0 0 0 1px var(--cth-ink-300), 1px 2px 0 rgba(26,19,32,0.18)',
            transform: 'rotate(4deg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--cth-font-display)', fontSize: 8, color: 'var(--cth-ink-900)',
            cursor: 'pointer'
          }}
        >
          {doingCount > 1 ? doingCount : '✎'}
        </button>
      )}
      <PixelPanel
        variant="default"
        style={{ height: '100%', padding: '6px 8px', ...godSurface }}
        noPadding
      >
        <div style={{ display: 'flex', gap: 8, height: '100%' }}>
          {/* Portrait tile — vertically centred so the card reads calm and even. */}
          <div style={{
            width: 36, height: isGod ? 50 : 46, alignSelf: 'center',
            // God's CARD is now accent-light, so the tile cannot be — it would
            // vanish into its own background. Paper reads as an inset frame
            // against the tint, which is what the tile is meant to look like.
            background: isGod ? 'var(--cth-paper-100)' : `var(--cth-${accent}-light)`,
            boxShadow: `inset 0 0 0 1px var(--cth-ink-${isGod ? '300' : '100'})`,
            // Anchor the sprite's TOP: the 56px-tall portrait overflows this
            // tile, and bottom-anchoring cropped the head — crop feet, not face.
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflow: 'hidden',
            flexShrink: 0
          }}>
            <SpritePortrait character={character} scale={2} />
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            {/* Identity row: name (+ BOSS tag) + status. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between', minWidth: 0 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                <span style={{
                  fontFamily: 'var(--cth-font-display)',
                  fontSize: 'var(--cth-text-display-sm)',
                  lineHeight: 'var(--cth-lh-display-sm)',
                  color: 'var(--cth-ink-900)',
                  flex: 1, minWidth: 0,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                }}>{name.toUpperCase()}</span>
                {isGod && (
                  <span style={{
                    fontFamily: 'var(--cth-font-display)', fontSize: 7, lineHeight: '11px',
                    background: `var(--cth-${accent})`, color: 'var(--cth-ink-900)',
                    padding: '1px 4px 0', flexShrink: 0
                  }}>BOSS</span>
                )}
                {/* FLOOR-01 - auto mode. The BOSS chip's exact shape (same
                    padding, same flexShrink) in lilac with a hairline, so it
                    can never be mistaken for the PixelBadge status chip beside
                    it. aria-hidden: the card's own aria-label already carries
                    the state, and announcing it twice is worse than once. An
                    INDICATOR - not focusable, not clickable, no role. Written at
                    the token, not a literal size, so wave 6's raise sweeps it. */}
                {autoMode && (
                  <span
                    aria-hidden="true"
                    title={`Auto mode: ${name} acts without asking for tool approval.`}
                    style={{
                      fontFamily: 'var(--cth-font-display)',
                      fontSize: 'var(--cth-text-display-md)',
                      lineHeight: 'var(--cth-lh-display-md)',
                      background: 'var(--cth-lilac-light)',
                      boxShadow: 'inset 0 0 0 1px var(--cth-lilac)',
                      color: 'var(--cth-ink-900)',
                      padding: '1px 4px 0', flexShrink: 0
                    }}
                  >AUTO</span>
                )}
              </span>
              {/* flexShrink:0 — the badge is a fixed 2-to-5 character chip; when
                  it was allowed to shrink, the browser resolved the overflow by
                  eating the NAME instead. Truncation should land on the longest,
                  most redundant thing, not on the identity. */}
              <PixelBadge status={typing ? 'typing' : status} style={{ flexShrink: 0 }} />
            </div>

            {/* Context line: action while working, repo while idle — plus the
                Claude pool-account chip when this agent is pinned to one. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
              <div
                title={`${project}${action && status !== 'idle' ? ` — ${action}` : ''}${row?.model ? ` · model: ${row.model}` : ''}${accountLabel ? ` · account: ${accountLabel}` : ''}`}
                style={{
                  flex: 1, minWidth: 0,
                  fontSize: 11, lineHeight: '14px',
                  color: 'var(--cth-ink-500)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                }}
              >{infoLine}</div>
              {/* FLOOR-13 field 5 — the model. The fullscreen roster row and the
                  command-centre row have always shown it and the card has not, so
                  the three renderings disagreed about what an agent IS. Same
                  shortModel() the roster row uses, imported rather than copied:
                  two copies of a formatter are two ways to render one id.
                  Sized from a token so wave 6's sweep has no literal to chase. */}
              <span
                title={row?.model ? `Model: ${row.model}` : 'Runs the CLI default model'}
                style={{
                  flexShrink: 0,
                  fontSize: 'var(--cth-text-body-sm)',
                  lineHeight: 'var(--cth-lh-body-sm)',
                  color: 'var(--cth-ink-500)',
                  whiteSpace: 'nowrap'
                }}
              >{shortModel(row?.model) ?? 'CLI default'}</span>
              {/* Cost before the account chip: money is the thing being asked
                  about, the account is context for it. Hidden until telemetry
                  reports a non-zero spend — "$0.00" on a fresh agent is noise. */}
              {!!usd && usd > 0 && (
                <span
                  title={`Estimated spend so far: $${usd.toFixed(2)}`}
                  style={{
                    flexShrink: 0,
                    fontFamily: 'var(--cth-font-mono)',
                    fontSize: 10, lineHeight: '13px',
                    color: 'var(--cth-ink-700)'
                  }}
                >${usd.toFixed(2)}</span>
              )}
              {accountLabel && (
                <span
                  title={`Claude account: ${accountLabel}`}
                  style={{
                    flexShrink: 0, maxWidth: 76,
                    fontSize: 9, lineHeight: '13px', padding: '0 4px',
                    background: 'var(--cth-cream-200)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)',
                    color: 'var(--cth-ink-700)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                  }}
                >{accountLabel}</span>
              )}
            </div>

            {/* God: voice on its own compact row. Workers: the private note row.
                Both sit ABOVE the gauge, so it is never covered. */}
            {isGod ? (
              // Talk grows an info mark when the OpenAI key is missing, so this
              // row can hold three things instead of two. `overflow: hidden` is
              // the guard: the toggle's label shrinks first (it has minWidth:0),
              // and if it still does not fit, the row clips INSIDE the card
              // instead of spilling over its border.
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  minWidth: 0, overflow: 'hidden'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <RealtimeMichaelToggle />
                <CostHud compact />
              </div>
            ) : (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, minHeight: 14 }}
              >
                {noteFirstLine ? (
                  <span
                    title={note}
                    style={{
                      flex: 1, minWidth: 0, fontSize: 10.5, lineHeight: '14px',
                      color: 'var(--cth-ink-500)', fontStyle: 'italic',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                    }}
                  >{noteFirstLine}</span>
                ) : <span style={{ flex: 1 }} />}
                {onEditNote && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onEditNote(); }}
                    title={note ? 'Edit private note' : 'Add private note'}
                    aria-label={`Edit note for ${name}`}
                    style={{
                      background: 'transparent', border: 'none', padding: 0,
                      flexShrink: 0, width: 15, height: 14,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, lineHeight: 1, cursor: 'pointer',
                      // Quiet until the card is hovered — discoverable, not noisy.
                      color: hover ? 'var(--cth-ink-500)' : 'var(--cth-ink-300)'
                    }}
                  >✎</button>
                )}
              </div>
            )}

            {/* Context gauge — slim fill bar pinned to the card's bottom edge. */}
            <div style={{ marginTop: 'auto' }} title={gaugeTitle}>
              <div style={{
                height: 4, width: '100%',
                background: 'var(--cth-cream-200)',
                boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)',
                overflow: 'hidden'
              }}>
                <div style={{ width: `${pct}%`, height: '100%', background: gaugeColor }} />
              </div>
            </div>
          </div>
        </div>
      </PixelPanel>
    </div>
  );
}
