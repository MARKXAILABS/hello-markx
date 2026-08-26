import { useEffect, useState, useSyncExternalStore } from 'react';
import { PixelPanel } from './PixelPanel';
import { PixelBadge } from './PixelBadge';
import { PixelButton } from './PixelButton';
import { SpritePortrait } from './SpritePortrait';
import { PtyTerminalView } from './PtyTerminalView';
import { terminalInstanceKey } from './terminalRecovery';
import { MessageQueueComposer } from './MessageQueueComposer';
import { CommandCenterPanel } from './CommandCenterPanel';
import { disposeTerminal } from './terminalPool';
import { SidebarTabs } from './SidebarTabs';
import { ThreadsPanel } from './ThreadsPanel';
import { ToolWaterfall } from './ToolWaterfall';
import { AgentControlStrip } from './AgentControlStrip';
import { BlockedBanner } from './BlockedBanner';
import { GitTab } from './GitTab';
import { Icon } from './Icon';
import { McpConsentModal } from './McpConsentModal';
import { useStore, type Agent } from '@/store/store';
import { answerAskFromBanner } from '@/hooks/useHive';
import { usePtyParser } from '@/hooks/usePtyParser';
import {
  inferAgentProvider,
  providerPreset,
  LOGIN_ACCOUNT_LABEL,
  AUTO_ACCOUNT_CHOICE,
  AUTO_ACCOUNT_LABEL,
  encodeAccountChoice,
  decodeAccountChoice,
  type ClaudeAccount
} from '@/store/config';
import {
  deriveCost,
  deriveDuration,
  deriveContext,
  deriveContextColor,
  deriveAccount,
  deriveState,
  getAgentViews,
  subscribeAgentViews
} from '@/store/agentView';

export interface AgentDetailPanelProps {
  agent: Agent;
}

export function AgentDetailPanel({ agent }: AgentDetailPanelProps) {
  const [openTerminalState, setOpenTerminalState] = useState<'idle' | 'opening' | 'ok' | 'error'>('idle');
  const [openTerminalError, setOpenTerminalError] = useState<string | undefined>();
  const [mcpModalOpen, setMcpModalOpen] = useState(false);
  // Claude account pool — offered only for Claude-engine agents once the
  // operator has registered accounts. Changing it updates the stored pin;
  // the running session keeps its current account until the next (re)start.
  const [claudeAccounts, setClaudeAccounts] = useState<ClaudeAccount[]>([]);
  // Re-read when the agent lands on another account (a failover can move it to
  // an account registered after this panel mounted — the select must name it).
  useEffect(() => {
    let alive = true;
    window.cth.getConfig()
      .then((c) => { if (alive) setClaudeAccounts(c.claudeAccounts ?? []); })
      .catch(() => { /* pool stays hidden */ });
    return () => { alive = false; };
  }, [agent.account]);
  const archiveAgent = useStore(s => s.archiveAgent);
  const updateAgent = useStore(s => s.updateAgent);
  const setFullscreen = useStore(s => s.setFullscreen);
  const fullscreenAgentId = useStore(s => s.fullscreenAgentId);
  const sidebarTab = useStore(s => s.sidebarTab);
  const setSidebarTab = useStore(s => s.setSidebarTab);
  const isReal = !!agent.ptyId;
  // While this agent is shown in the fullscreen overlay, the fullscreen view
  // owns the pty (it sizes it to fill the screen). Keeping the embedded terminal
  // mounted too means two xterms fight over the pty's cols/rows — which corrupts
  // the display and breaks scrolling. So we unmount the embedded one here; it
  // re-mounts and re-fits when fullscreen closes.
  const isFullscreenedHere = fullscreenAgentId === agent.id;

  const onPtyStream = usePtyParser(agent.id);

  // Michael gets the full command-center dashboard instead of the plain panel.
  //
  // SCALE-05 / UI-SPEC S2d — STATED RESIDUAL, not an oversight. Returning here means
  // the god never renders this component's body and therefore never renders the
  // consolidated five-field stat card below. CommandCenterPanel's floor tab already
  // shows cost, context and breaker state per roster row; it shows NEITHER DURATION
  // NOR ACCOUNT, so those two fields are genuinely absent for the god alone.
  //
  // The decision was to leave it that way rather than mount the card above the
  // command centre's tab strip, which would close the gap in one line at a cost of
  // roughly 62px of vertical space in the most contended column in the app. This
  // comment exists because S2d requires the gap be declared out loud where the code
  // makes it, and plan 03-08's SUMMARY records it as a named residual.
  if (agent.isGod) return <CommandCenterPanel agent={agent} />;

  const openTerminal = async () => {
    setOpenTerminalState('opening');
    setOpenTerminalError(undefined);
    try {
      const result = await window.cth.openTerminalAt(agent.cwd);
      if (result.ok) {
        setOpenTerminalState('ok');
        setTimeout(() => setOpenTerminalState('idle'), 1500);
      } else {
        setOpenTerminalState('error');
        setOpenTerminalError(result.error ?? 'unknown error');
        setTimeout(() => setOpenTerminalState('idle'), 4000);
      }
    } catch (e) {
      setOpenTerminalState('error');
      setOpenTerminalError(e instanceof Error ? e.message : String(e));
      setTimeout(() => setOpenTerminalState('idle'), 4000);
    }
  };

  const onKill = async () => {
    if (!agent.ptyId) return;
    if (!confirm(`Close ${agent.name}? The PTY process will terminate and the agent is archived (kept in history, off the floor).`)) return;
    await window.cth.killPty(agent.ptyId);
    disposeTerminal(agent.ptyId);
    archiveAgent(agent.id);
  };

  return (
    <>
    <PixelPanel
      variant="default"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: 0,
        overflow: 'hidden'
      }}
      noPadding
    >
      {/* Thin header strip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 8px',
        background: 'var(--cth-cream-100)',
        borderBottom: '1px solid var(--cth-ink-700)',
        flexShrink: 0
      }}>
        <div style={{
          width: 32, height: 32,
          background: `var(--cth-${agent.accent}-light)`,
          boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden',
          flexShrink: 0
        }}>
          <SpritePortrait character={agent.character} scale={1} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--cth-font-display)',
            fontSize: 'var(--cth-text-display-md)', lineHeight: 'var(--cth-lh-display-md)',
            color: 'var(--cth-ink-900)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
          }}>{agent.name.toUpperCase()}</div>
          <div style={{
            display: 'flex', gap: 6, alignItems: 'center', marginTop: 1
          }}>
            <PixelBadge status={agent.status} />
            <span style={{
              fontSize: 'var(--cth-text-body-md)', lineHeight: 'var(--cth-lh-body-md)', color: 'var(--cth-ink-500)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
            }}>{agent.project}</span>
            {/* Claude account pin — stored now, applied on the next (re)start
                (restart & continue in the Command Center, or an app restart). */}
            {inferAgentProvider(agent.command, agent.provider) === 'claude' && claudeAccounts.length > 0 && (
              <select
                value={encodeAccountChoice(agent.accountPolicy, agent.account)}
                title="Claude account for this agent (or Auto = least-loaded healthy account, with automatic failover) — takes effect on the next restart (Command Center → restart & continue)"
                onChange={(e) => updateAgent(agent.id, decodeAccountChoice(e.target.value))}
                style={{
                  padding: '1px 4px', background: 'var(--cth-paper-100)', border: 'none',
                  boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)',
                  fontFamily: 'var(--cth-font-ui)', fontSize: 'var(--cth-text-body-md)', lineHeight: 'var(--cth-lh-body-md)', color: 'var(--cth-ink-700)',
                  cursor: 'pointer', flexShrink: 0, maxWidth: 130
                }}
              >
                <option value="">{LOGIN_ACCOUNT_LABEL}</option>
                <option value={AUTO_ACCOUNT_CHOICE}>{AUTO_ACCOUNT_LABEL}</option>
                {claudeAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>{acc.label}</option>
                ))}
              </select>
            )}
          </div>
        </div>
        {/* v0.3.4: the IDE lives at agent level (replaces the old files tab) —
            opens the full-window Monaco editor rooted at this agent's workspace. */}
        <PixelButton variant="secondary" size="sm" onClick={() => useStore.getState().setIdeOpen(true, agent.id)}>
          <span title={`Open the IDE — file editor + git diff for ${agent.project}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name="code" /> IDE
          </span>
        </PixelButton>
        <PixelButton variant="secondary" size="sm" onClick={openTerminal} disabled={openTerminalState === 'opening'}>
          <span title={`open Terminal.app at ${agent.cwd}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name="terminal" />
            {openTerminalState === 'opening' ? '...' : openTerminalState === 'ok' ? 'ok' : openTerminalState === 'error' ? 'err' : 'open'}
          </span>
        </PixelButton>
        {/* DAEMON-04 — the consent modal's launch point for a worker. No
            correct restart implementation is in scope here (that closure is
            CommandCenterPanel.tsx's), so onRestart is omitted; the modal's
            own running-agent notice names where the control lives instead. */}
        <PixelButton variant="secondary" size="sm" onClick={() => setMcpModalOpen(true)}>
          MCP
        </PixelButton>
        {/* The only icon-only control in this panel, and it was the only button
            on the whole agent surface with an EMPTY accessible name — measured on
            the AX tree at BASE and at HEAD, not inferred from a grep. It ships as
            `title` rather than `aria-label` because PixelButton's props are a
            closed set that plan 23 pins byte-identical, so no caller can hand it
            an aria-label. Names the agent, per FullscreenTerminal.tsx:665. */}
        {isReal && (
          <PixelButton
            variant="destructive"
            size="sm"
            onClick={onKill}
            title={`End ${agent.name}'s process`}
          >
            <Icon name="x" />
          </PixelButton>
        )}
      </div>

      {openTerminalError && (
        <div style={{
          fontSize: 'var(--cth-text-body-md)', lineHeight: 'var(--cth-lh-body-md)', color: 'var(--cth-coral)',
          padding: '2px 8px',
          background: 'var(--cth-coral-light)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
        }}>{openTerminalError}</div>
      )}

      {/* SCALE-05 — the five numbers an operator asks for, in one place. Between the
          error strip (which stays adjacent to the button that raises it) and the
          BlockedBanner (which stays adjacent to the tabs, deliberately — see below). */}
      <AgentStatCard
        agent={agent}
        accountLabel={agent.accountPolicy === 'auto'
          ? AUTO_ACCOUNT_LABEL
          : claudeAccounts.find((a) => a.id === agent.account)?.label}
      />


      {/* #12 — "what needs me". usePtyParser has written blockReason since the
          parser was added and NOTHING rendered it: an agent sitting on "Do you
          want to proceed?" was a red dot on a 16px avatar and nothing else.
          Above the tabs on purpose — a prompt waiting on a human outranks
          whichever tab happens to be open, and it is the one thing in this
          panel the user has to act on. */}
      {agent.blockReason && (
        <BlockedBanner
          reason={agent.blockReason}
          onAction={(label, send) => {
            // GATE-05 — an ask goes to the approval IPC and NEVER to a PTY (ADR-0001).
            // The shipped decision, shared with CommandCenterPanel so a security branch
            // cannot drift into two versions; it returns true when it took the click.
            if (answerAskFromBanner(agent, label)) return;
            // `send` is the literal keystrokes for the prompt on screen ('y\r').
            // No pty, or a purely informational action, means nothing to type —
            // clear the banner either way so a stale prompt does not sit here
            // after the terminal has moved on.
            if (send && agent.ptyId) void window.cth.writePty(agent.ptyId, send);
            updateAgent(agent.id, { blockReason: undefined });
          }}
        />
      )}

      {/* #7C — operator control (pause / halt / steer) for live agents */}
      {isReal && <AgentControlStrip agentId={agent.id} />}

      {/* Tabs */}
      <SidebarTabs current={sidebarTab} accent={agent.accent} onChange={setSidebarTab} />

      {/* Active tab body — fills remaining space */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {sidebarTab === 'terminal' && (
          isReal && agent.ptyId ? (
            isFullscreenedHere ? (
              <EmptyTab title="In fullscreen">
                This terminal is open in fullscreen. Press Esc or exit fullscreen to bring it back here.
              </EmptyTab>
            ) : (
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
                <PtyTerminalView
                  key={terminalInstanceKey(agent.ptyId, agent.terminalGeneration)}
                  ptyId={agent.ptyId}
                  onStreamData={onPtyStream}
                  onUserPrompt={(t) => {
                    updateAgent(agent.id, { lastPrompt: t });
                    if (t.trim().toLowerCase() === '/clear') {
                      updateAgent(agent.id, { contextTokens: 0, contextLimit: undefined, progress: 0 });
                    }
                    void window.cth.historyAdd({ agentId: agent.id, cwd: agent.cwd, text: t });
                  }}
                  onToggleFullscreen={() => setFullscreen(agent.id)}
                  fullscreen={false}
                  embedded
                />
              </div>
              <MessageQueueComposer agent={agent} />
            </div>
            )
          ) : (
            <EmptyTab title="No PTY">
              This agent has no live terminal. Spawn an agent through "add agent" to use the terminal tab.
            </EmptyTab>
          )
        )}

        {sidebarTab === 'git' && (
          <GitTab cwd={agent.cwd} />
        )}

        {sidebarTab === 'messages' && (
          <ThreadsPanel agentId={agent.id} />
        )}

        {sidebarTab === 'traces' && (
          <ToolWaterfall agentId={agent.id} />
        )}
      </div>
    </PixelPanel>
    {mcpModalOpen && (
      <McpConsentModal agent={agent} onClose={() => setMcpModalOpen(false)} />
    )}
    </>
  );
}

/**
 * SCALE-05 (D-33/D-34/D-35, UI-SPEC §S2) — cost · up · context · account · state.
 *
 * EVERY value here comes from `store/agentView.ts`. This component computes nothing:
 * it is markup over a derivation, and that is not a style preference. FLOOR-13 unified
 * the AUTO chip through a shared module and unified cost by copying an expression into
 * three files; only the copied half drifted, into three different answers to "is this
 * agent about to compact?". So the rules live in one testable place and this file
 * renders them.
 *
 * Every one of the five cells has a DECLARED-GAP branch, and the words differ because
 * the facts do — `not recorded` (no spawn stamp) and `not reported` (no token/limit
 * pair) are not interchangeable, and neither is a substitute for the other. A
 * plausible-looking zero is the faked capability D-35 forbids: `$0.00` reads as
 * "cheap", `0s` as "just started", `0%` as "empty", `healthy` as "safe to leave alone".
 *
 * Exported so `test/renderer-components.test.cjs` can server-render THIS, with real
 * markup for every branch. The whole `AgentDetailPanel` cannot be server-rendered
 * today — it reaches `PtyTerminalView` → `useAppTheme` (`design/theme.ts:57`), which
 * calls `useSyncExternalStore` with TWO arguments and therefore throws "Missing
 * getServerSnapshot" under `renderToStaticMarkup`. That is a pre-existing defect in a
 * file plan 03-08 does not own; it is recorded in the plan's SUMMARY, not worked
 * around here.
 *
 * The grid is `auto-fit`/`minmax(120px, 1fr)` on purpose: it reflows to five across in
 * a wide panel and to fewer in the docked rail, with no fixed width to get wrong. A
 * fixed five-column row is the "one unshrinkable sibling" shape that once drove this
 * app's agent name to zero width.
 */
export function AgentStatCard({ agent, accountLabel }: { agent: Agent; accountLabel?: string }) {
  // Three arguments, and the third is MANDATORY: React 18 throws "Missing
  // getServerSnapshot" on the server, which would make every SCALE-05 assertion fail
  // to RUN rather than fail red.
  const views = useSyncExternalStore(subscribeAgentViews, getAgentViews, getAgentViews);
  const view = views[agent.id] ?? {};

  const preset = providerPreset(inferAgentProvider(agent.command, agent.provider));
  const cost = deriveCost(view, preset.costTracking, preset.label, agent.name);
  const up = deriveDuration(view.spawnedAt);
  const ctx = deriveContext(agent.contextTokens, agent.contextLimit);
  const state = deriveState(view.breaker);

  const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  const stateColor = state === 'stopped' ? 'var(--cth-coral)'
    : state === 'steering' || state === 'constrained' ? 'var(--cth-lemon)'
      : state === 'unknown' ? 'var(--cth-ink-500)'
        : 'var(--cth-ink-700)';

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
      gap: 'var(--cth-space-2)',
      padding: 'var(--cth-space-3)',
      background: 'var(--cth-paper-100)',
      boxShadow: 'var(--cth-panel-border-inset)',
      flexShrink: 0
    }}>
      {/* cost. The `$` character appears on the measured branch and NOWHERE else —
          that is the whole contract, and a `lifetime` total is labelled because it is
          an ALL-TIME figure sitting next to an `up` clock that resets every respawn. */}
      <StatCell label="cost">
        {cost.kind === 'measured' ? (
          <span
            style={{ color: 'var(--cth-ink-900)' }}
            title={cost.lifetime
              ? `${agent.name}'s ALL-TIME spend, read from its transcript — not spend since this spawn.`
              : `${agent.name}'s spend this session.`}
          >{`$${cost.usd.toFixed(2)}${cost.lifetime ? ' (lifetime)' : ''}`}</span>
        ) : (
          // Three gaps, three sentences. Calling an unattributable CLAUDE agent
          // "no cost meter" claims its engine cannot report when it can.
          <span style={{ color: 'var(--cth-ink-500)' }} title={cost.reason}>
            {cost.reasonKind === 'no-meter' ? 'no cost meter'
              : cost.reasonKind === 'unattributed' ? 'spend not attributable'
                : 'no reading yet'}
          </span>
        )}
      </StatCell>

      {/* up */}
      <StatCell label="up">
        <span style={{ color: up === 'not recorded' ? 'var(--cth-ink-500)' : 'var(--cth-ink-900)' }}>
          {up}
        </span>
      </StatCell>

      {/* context — `not reported`, never `0%` and never an empty rail. */}
      <StatCell label="context">
        {ctx.kind === 'measured' ? (
          <>
            <span style={{ color: 'var(--cth-ink-900)' }}>
              {`${k(ctx.tokens)} / ${k(ctx.limit)} (${ctx.pct}%)`}
            </span>
            <span style={{
              display: 'block', marginTop: 2, height: 4,
              background: 'var(--cth-ink-100)', overflow: 'hidden'
            }}>
              <span style={{
                display: 'block', width: `${ctx.pct}%`, height: '100%',
                background: deriveContextColor(ctx.pct, agent.accent)
              }} />
            </span>
          </>
        ) : (
          <span style={{ color: 'var(--cth-ink-500)' }} title={`No context window has been reported for ${agent.name}.`}>
            not reported
          </span>
        )}
      </StatCell>

      {/* account */}
      <StatCell label="account">
        <span style={{
          color: 'var(--cth-ink-900)',
          display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
        }}>{deriveAccount(accountLabel)}</span>
      </StatCell>

      {/* state — `unknown` until control:breakerSnapshot resolves. `healthy` is
          specifically the wrong default: it would call a stopped agent safe for a
          full breaker beat after every window reload. */}
      <StatCell label="state">
        <span
          style={{ color: stateColor }}
          title={view.breaker?.reason
            ? `Breaker: ${state} — ${view.breaker.reason}`
            : "The breaker has not reported for this agent yet, so its state is 'unknown' rather than assumed healthy."}
        >{state}</span>
      </StatCell>
    </div>
  );
}

/** One cell: a lowercase label over its value. */
function StatCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontSize: 'var(--cth-text-body-sm)', lineHeight: 'var(--cth-lh-body-sm)',
        color: 'var(--cth-ink-500)'
      }}>{label}</div>
      <div style={{
        fontFamily: 'var(--cth-font-mono)',
        fontSize: 'var(--cth-text-mono-md)', lineHeight: 'var(--cth-lh-mono)',
        minWidth: 0, overflow: 'hidden'
      }}>{children}</div>
    </div>
  );
}

function EmptyTab({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 16, gap: 8,
      background: 'var(--cth-paper-200)'
    }}>
      <div style={{
        fontFamily: 'var(--cth-font-display)', fontSize: 'var(--cth-text-display-md)', lineHeight: 'var(--cth-lh-display-md)',
        color: 'var(--cth-ink-500)'
      }}>{title.toUpperCase()}</div>
      <p style={{
        margin: 0, fontSize: 'var(--cth-text-body-md)', lineHeight: 'var(--cth-lh-body-md)', textAlign: 'center', color: 'var(--cth-ink-700)',
        maxWidth: 280
      }}>{children}</p>
    </div>
  );
}
