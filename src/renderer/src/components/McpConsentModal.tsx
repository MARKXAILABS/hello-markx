import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { PixelButton } from './PixelButton';
import { MCP_CATALOG, type McpTier } from '@shared/mcpCatalog';
import { getMcpGrantsSnapshot, grantMcpBatch, setMcpGrants } from '@/store/config';
import type { Agent } from '@/store/store';

/**
 * DAEMON-04's consent dialog (D-29). Built ON `Modal` (role="dialog",
 * aria-modal, focus trap, all already correct) — this component adds none of
 * that itself.
 *
 * NOT a reuse of `AddAgentModal.tsx:516-556`'s safe/needs-consent split — that
 * block lives inside a `hireMeta.mcpServers` PREVIEW and is not a general
 * consent UI (RESEARCH §4.7). This copies its SHAPE (the two-list split), not
 * its code.
 *
 * Write-only secret contract, copied exactly from
 * `preload/index.ts:1235-1244`'s own doc comment: `secret` is passed once and
 * is never readable back. This component never reads a secret value out of
 * `window.cth` — only `hasSecret` booleans (D-28).
 */

export interface McpConsentModalProps {
  agent: Pick<Agent, 'id' | 'name' | 'command' | 'provider' | 'ptyId'>;
  onClose: () => void;
  /**
   * `restartWithModel`-shaped explicit respawn (D-29's "explicit respawn"
   * option). `CommandCenterPanel.tsx:435`'s 90-line closure disposes and
   * re-acquires the terminal, resolves the account pin, hard-fails a refused
   * resume — a second copy of that flow is forbidden (this codebase's own
   * "three copies of a safety rule are three chances to start lying").
   * OPTIONAL: `AgentDetailPanel.tsx` has no correct implementation of it in
   * scope, so it omits this prop and the notice below names where the
   * control lives instead of rendering a button that does nothing.
   */
  onRestart?: () => void;
}

interface AgentMcpState {
  wired: boolean;
  safe: string[];
  granted: { id: string; tier: string; hasSecret: boolean }[];
  armed: string[];
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--cth-font-display)',
  fontSize: 'var(--cth-text-display-md)',
  lineHeight: 'var(--cth-lh-display-md)',
  color: 'var(--cth-ink-500)',
  textTransform: 'uppercase'
};

const bodyStyle: React.CSSProperties = {
  fontFamily: 'var(--cth-font-ui)',
  fontSize: 'var(--cth-text-body-md)',
  lineHeight: 'var(--cth-lh-body-md)',
  color: 'var(--cth-ink-500)'
};

function requiresSecret(entry: (typeof MCP_CATALOG)[number]): boolean {
  return Object.keys(entry.spec.env ?? {}).length > 0;
}

export function McpConsentModal({ agent, onClose, onRestart }: McpConsentModalProps) {
  const [state, setState] = useState<AgentMcpState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Not-yet-granted rows staged for the NEXT "grant to {name}" click.
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  // Write-only staged key text, per catalog id. Cleared the instant it is
  // submitted — never held after a successful grant, never rendered back.
  const [keys, setKeys] = useState<Record<string, string>>({});
  // Already-granted rows the operator asked to re-key.
  const [replacing, setReplacing] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setLoadError(null);
    window.cth.mcpAgentState(agent.id)
      .then((res) => {
        if (!res.ok) { setLoadError(res.error); setLoading(false); return; }
        setState(res);
        setLoading(false);
        // Publish into the card's grants mirror (store/config.ts's own
        // documented contract) so AgentCard repaints without its own refetch.
        const snap = getMcpGrantsSnapshot();
        setMcpGrants({
          ...snap,
          agents: { ...snap.agents, [agent.id]: { granted: res.granted as never, armed: res.armed } }
        });
      })
      .catch((e) => { setLoadError(e instanceof Error ? e.message : String(e)); setLoading(false); });
  };
  useEffect(load, [agent.id]);

  const consentEntries = MCP_CATALOG.filter((e) => e.tier !== 'safe-readonly');
  const safeEntries = MCP_CATALOG.filter((e) => e.tier === 'safe-readonly');
  const grantedById = new Map((state?.granted ?? []).map((g) => [g.id, g]));

  const checkedIds = Object.keys(checked).filter((id) => checked[id]);
  const canGrant = checkedIds.length > 0 && checkedIds.every((id) => {
    const entry = consentEntries.find((e) => e.id === id);
    return !entry || !requiresSecret(entry) || !!keys[id];
  });

  const submitGrant = async () => {
    setBusy(true);
    setActionError(null);
    const { granted, error } = await grantMcpBatch(checkedIds, (id) =>
      window.cth.mcpGrant({ agentId: agent.id, mcpId: id, secret: keys[id] })
    );
    // Straight-line on purpose (CR-01): a partial batch failure still means main
    // GRANTED everything in `granted`, so the checked rows and their submitted
    // secrets clear for exactly those ids — the write-once-clear-immediately
    // invariant this file documents does not get a failure exemption — and
    // `load()` republishes the grants mirror on every path. An early return here
    // is what left the modal and every AgentCard reporting an already-granted
    // server as ungranted for the rest of the session.
    setChecked((prev) => {
      const next = { ...prev };
      for (const id of granted) delete next[id];
      return next;
    });
    setKeys((prev) => {
      const next = { ...prev };
      for (const id of granted) delete next[id];
      return next;
    });
    setActionError(error);
    setBusy(false);
    load();
  };

  const submitRevoke = async (id: string, label: string) => {
    // Native confirm(), matching this codebase's own destructive-action
    // precedent (AgentDetailPanel.tsx's onKill) — the copy is the Copywriting
    // Contract's, the OK/Cancel chrome is the platform's.
    if (!window.confirm(
      `Revoke ${label} from ${agent.name}? The stored key is deleted — you will have to paste it again to re-grant.`
    )) return;
    setBusy(true);
    setActionError(null);
    const res = await window.cth.mcpRevoke({ agentId: agent.id, mcpId: id });
    if (!res.ok) { setActionError(res.error ?? `${id}: revoke failed`); setBusy(false); return; }
    setBusy(false);
    load();
  };

  const saveKey = async (id: string) => {
    const secret = keys[id];
    if (!secret) return;
    setBusy(true);
    setActionError(null);
    const res = await window.cth.mcpGrant({ agentId: agent.id, mcpId: id, secret });
    if (!res.ok) { setActionError(res.error ?? `${id}: could not save key`); setBusy(false); return; }
    setReplacing((prev) => ({ ...prev, [id]: false }));
    setKeys((prev) => { const next = { ...prev }; delete next[id]; return next; });
    setBusy(false);
    load();
  };

  const tierChip = (tier: string) => (
    <span style={{
      fontFamily: 'var(--cth-font-display)', fontSize: 'var(--cth-text-display-md)', lineHeight: 'var(--cth-lh-display-md)',
      background: 'var(--cth-cream-200)', boxShadow: 'inset 0 0 0 1px var(--cth-coral)',
      color: 'var(--cth-ink-900)', padding: '1px 4px 0', flexShrink: 0
    }}>{tier.toUpperCase()}</span>
  );

  return (
    <Modal title={`MCP servers for ${agent.name}`} onClose={onClose} width={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }}>
        {/* Section 1 — the standing warning, first, above both lists. D-29's
            single most important sentence on this surface. */}
        <div
          data-cth-section="warning"
          style={{ ...bodyStyle, color: 'var(--cth-coral)' }}
        >
          {agent.name} runs with permissions bypassed. A server you grant here runs its tools without asking you.
        </div>

        {loading && <div style={bodyStyle}>loading…</div>}
        {loadError && <div style={{ ...bodyStyle, color: 'var(--cth-coral)' }}>{loadError}</div>}

        {state && (
          <>
            {/* Section 2 — List A, read-only, floor-wide (D-27: no per-agent
                toggle here — that would imply an override that does not exist). */}
            <div data-cth-section="list-a" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={labelStyle}>Safe, pre-enabled</span>
                <span style={bodyStyle}>
                  Read-only, no secrets, scoped to {agent.name}&rsquo;s workspace. Managed for the whole floor in Settings → Connections.
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {safeEntries.map((entry) => (
                  <div key={entry.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px',
                    background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)'
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
                      <span style={{ ...bodyStyle, color: 'var(--cth-ink-900)', fontWeight: 600 }}>
                        {entry.label}{' '}
                        <code style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 'var(--cth-text-mono-md)', lineHeight: 'var(--cth-lh-mono)', color: 'var(--cth-ink-500)', fontWeight: 400 }}>{entry.id}</code>
                      </span>
                      <span style={bodyStyle}>{entry.description}</span>
                    </div>
                    <span style={{ ...bodyStyle, flexShrink: 0 }}>{state.safe.includes(entry.id) ? 'on' : 'off'}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 3 — List B, every write/secret catalog entry, always
                shown (never behind a disclosure). */}
            <div data-cth-section="list-b" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ ...labelStyle, color: 'var(--cth-coral)' }}>
                  <span aria-hidden="true">⚠</span> Needs your consent — NOT auto-enabled
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {consentEntries.map((entry) => {
                  const granted = grantedById.get(entry.id);
                  const needsKey = requiresSecret(entry);
                  const isChecked = !!checked[entry.id];
                  const isReplacing = !!replacing[entry.id];
                  // "pending · restart" = granted \ armed, computed HERE in
                  // the renderer, per the preload's own mcpAgentState doc
                  // comment — main never claims a live connection (D-29).
                  const isPending = !!granted && !!agent.ptyId && !(state?.armed ?? []).includes(entry.id);
                  return (
                    <fieldset
                      key={entry.id}
                      style={{
                        display: 'flex', flexDirection: 'column', gap: 6,
                        padding: 8, border: 'none',
                        background: 'var(--cth-paper-100)',
                        boxShadow: `inset 0 0 0 1px ${granted ? 'var(--cth-coral)' : 'var(--cth-ink-300)'}`
                      }}
                    >
                      <legend style={{ ...bodyStyle, color: 'var(--cth-ink-900)', fontWeight: 600, padding: 0 }}>
                        {entry.label}{' '}
                        <code style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 'var(--cth-text-mono-md)', lineHeight: 'var(--cth-lh-mono)', color: 'var(--cth-ink-500)', fontWeight: 400 }}>{entry.id}</code>
                      </legend>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {!granted && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 4, ...bodyStyle }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => setChecked((prev) => ({ ...prev, [entry.id]: e.target.checked }))}
                            />
                            grant this to {agent.name}
                          </label>
                        )}
                        {tierChip(entry.tier)}
                        {granted && (
                          <PixelButton
                            variant="destructive" size="sm"
                            disabled={busy}
                            onClick={() => submitRevoke(entry.id, entry.label)}
                          >
                            revoke
                          </PixelButton>
                        )}
                      </div>
                      <span style={bodyStyle}>{entry.description}</span>
                      {/* Launch spec — VERBATIM, exactly as it will be executed.
                          No truncation, no ellipsis, no prettifying (D-29). */}
                      <code style={{
                        fontFamily: 'var(--cth-font-mono)', fontSize: 'var(--cth-text-mono-md)', lineHeight: 'var(--cth-lh-mono)',
                        background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
                        padding: '4px 6px', wordBreak: 'break-all', color: 'var(--cth-ink-900)'
                      }}>
                        {entry.spec.command} {entry.spec.args.join(' ')}
                      </code>
                      {needsKey && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                          <span style={{ ...bodyStyle, flexShrink: 0 }}>env:</span>
                          {Object.keys(entry.spec.env ?? {}).map((name) => (
                            <code key={name} style={{
                              fontFamily: 'var(--cth-font-mono)', fontSize: 'var(--cth-text-mono-md)', lineHeight: 'var(--cth-lh-mono)',
                              background: 'var(--cth-cream-200)', padding: '0 4px', color: 'var(--cth-ink-700)'
                            }}>{name}</code>
                          ))}
                        </div>
                      )}
                      {needsKey && !granted && (
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={bodyStyle}>key</span>
                          <input
                            type="password"
                            autoComplete="off"
                            value={keys[entry.id] ?? ''}
                            onChange={(e) => setKeys((prev) => ({ ...prev, [entry.id]: e.target.value }))}
                            placeholder="paste the key — stored encrypted, never shown again"
                            style={{
                              padding: '4px 6px', background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
                              border: 'none', fontFamily: 'var(--cth-font-ui)', fontSize: 'var(--cth-text-body-md)', lineHeight: 'var(--cth-lh-body-md)'
                            }}
                          />
                        </label>
                      )}
                      {needsKey && granted && !isReplacing && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={bodyStyle}>{granted.hasSecret ? 'key stored' : 'no key stored'}</span>
                          <PixelButton variant="ghost" size="sm" onClick={() => setReplacing((prev) => ({ ...prev, [entry.id]: true }))}>
                            replace key
                          </PixelButton>
                        </div>
                      )}
                      {needsKey && granted && isReplacing && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <input
                            type="password"
                            autoComplete="off"
                            value={keys[entry.id] ?? ''}
                            onChange={(e) => setKeys((prev) => ({ ...prev, [entry.id]: e.target.value }))}
                            placeholder="paste the key — stored encrypted, never shown again"
                            style={{
                              padding: '4px 6px', background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
                              border: 'none', fontFamily: 'var(--cth-font-ui)', fontSize: 'var(--cth-text-body-md)', lineHeight: 'var(--cth-lh-body-md)'
                            }}
                          />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <PixelButton variant="secondary" size="sm" disabled={busy || !keys[entry.id]} onClick={() => saveKey(entry.id)}>
                              save key
                            </PixelButton>
                            <PixelButton variant="ghost" size="sm" onClick={() => setReplacing((prev) => ({ ...prev, [entry.id]: false }))}>
                              cancel
                            </PixelButton>
                          </div>
                        </div>
                      )}
                      {isPending && (
                        <span style={bodyStyle}>pending · restart</span>
                      )}
                    </fieldset>
                  );
                })}
              </div>
            </div>

            {/* Section 4 — the running-agent notice, only when the agent has
                a live PTY (D-29). */}
            {agent.ptyId && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...bodyStyle }}>
                <span>
                  {agent.name} is running. Anything you change here takes effect the next time it starts — no engine reloads its server set.
                </span>
                {onRestart ? (
                  <PixelButton variant="secondary" size="sm" onClick={onRestart}>
                    restart {agent.name} now
                  </PixelButton>
                ) : (
                  <span style={{ ...bodyStyle, fontStyle: 'italic' }}>
                    Restart from the Command Center&rsquo;s roster row.
                  </span>
                )}
              </div>
            )}
          </>
        )}

        {actionError && <div style={{ ...bodyStyle, color: 'var(--cth-coral)' }}>{actionError}</div>}

        {/* Footer. `grant` is disabled until every newly-checked secret-tier
            row has a key — this is defense in depth, not the security boundary. The
            boundary is main's fail-closed tier branch
            (`e.tier !== 'safe-readonly' && consented !== true`, moved to
            hiveProvisioning.ts by 02-01, read per-agent by 02-11). A UI-only
            gate is bypassable by any other writer of the config. */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <PixelButton variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            cancel
          </PixelButton>
          <PixelButton variant="primary" size="sm" onClick={submitGrant} disabled={!canGrant || busy}>
            grant to {agent.name}
          </PixelButton>
        </div>
      </div>
    </Modal>
  );
}
