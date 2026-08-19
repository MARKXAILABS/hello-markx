import { useEffect, useState, type CSSProperties } from 'react';
import type { ClaudeAccount, HarnessConfig } from '@/store/config';
import { newAccountLabelError, describeHealth } from '@/store/config';
import { PixelButton } from './PixelButton';
import { useStore } from '@/store/store';
import { useClaudeAccountPool } from '@/hooks/useClaudeAccountPool';

/**
 * ClaudeAccountsSettings — the N-account Claude pool (v0.4.5, PR 1).
 *
 * Each account = a label + a `claude setup-token` OAuth token for one Claude
 * subscription. Metadata ({id,label,createdAt}) rides HarnessConfig; the token
 * itself is WRITE-ONLY in the encrypted secret broker (`claudeAccount*` IPC) —
 * this component only ever learns "token stored ✓". Agents are pinned to an
 * account in Add Agent / the agent's panel; unpinned agents keep using the
 * machine's `/login` account exactly as before.
 */

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '6px 8px 4px',
  background: 'var(--cth-paper-100)',
  border: 'none',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)',
  fontFamily: 'var(--cth-font-ui)',
  fontSize: 13,
  color: 'var(--cth-ink-900)',
  outline: 'none'
};
const labelStyle: CSSProperties = {
  fontFamily: 'var(--cth-font-display)',
  fontSize: 8,
  lineHeight: '12px',
  color: 'var(--cth-ink-700)',
  textTransform: 'uppercase'
};
const headStyle: CSSProperties = {
  fontFamily: 'var(--cth-font-display)', fontSize: 8, lineHeight: '12px',
  color: 'var(--cth-ink-500)', textTransform: 'uppercase', marginBottom: 2
};
const mono: CSSProperties = { fontFamily: 'var(--cth-font-mono)' };

export function ClaudeAccountsSettings({
  config,
  onConfigChange
}: {
  config: HarnessConfig;
  onConfigChange?: (config: HarnessConfig) => void;
}) {
  const [accounts, setAccounts] = useState<ClaudeAccount[]>(config.claudeAccounts ?? []);
  const [hasToken, setHasToken] = useState<Record<string, boolean>>({});
  // Add-account drafts.
  const [newLabel, setNewLabel] = useState('');
  const [newToken, setNewToken] = useState('');
  const [addNote, setAddNote] = useState<string | null>(null);
  // Per-account replace-token drafts + notes.
  const [draftToken, setDraftToken] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  // Live roster — used only to warn which agents a removal would strand.
  const agents = useStore((s) => s.agents);
  // Live health (PR 2) — shown per row so a dead/cooling account is obvious
  // right where its token gets replaced (saving a token marks it active again).
  const pool = useClaudeAccountPool();

  // Presence booleans (never the values) for the stored ✓ markers.
  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<string, boolean> = {};
      for (const a of accounts) {
        try { out[a.id] = await window.cth.claudeAccountHas(a.id); } catch { out[a.id] = false; }
      }
      if (alive) setHasToken(out);
    })();
    return () => { alive = false; };
  }, [accounts]);

  const refreshConfig = async () => {
    try {
      const fresh = await window.cth.getConfig();
      setAccounts(fresh.claudeAccounts ?? []);
      onConfigChange?.(fresh);
    } catch { /* keep local state */ }
  };

  const add = async () => {
    setAddNote(null);
    const labelError = newAccountLabelError(newLabel, accounts);
    if (labelError) { setAddNote(labelError); return; }
    if (!newToken.trim()) { setAddNote('Paste the token printed by `claude setup-token`'); return; }
    try {
      const r = await window.cth.claudeAccountAdd({ label: newLabel.trim(), token: newToken.trim() });
      if (r.ok) {
        setNewLabel('');
        setNewToken('');
        setAddNote('account added — token stored');
        await refreshConfig();
      } else setAddNote(r.error ?? 'failed');
    } catch (e) { setAddNote(e instanceof Error ? e.message : String(e)); }
  };

  const replaceToken = async (id: string) => {
    const token = (draftToken[id] ?? '').trim();
    if (!token) return;
    try {
      const r = await window.cth.claudeAccountSet({ id, token });
      if (r.ok) {
        setDraftToken((s) => ({ ...s, [id]: '' }));
        setHasToken((s) => ({ ...s, [id]: true }));
        setNote((s) => ({ ...s, [id]: 'token replaced' }));
      } else setNote((s) => ({ ...s, [id]: r.error ?? 'failed' }));
    } catch (e) { setNote((s) => ({ ...s, [id]: e instanceof Error ? e.message : String(e) })); }
  };

  const clearToken = async (id: string) => {
    try {
      await window.cth.claudeAccountClear(id);
      setHasToken((s) => ({ ...s, [id]: false }));
      setNote((s) => ({ ...s, [id]: 'token cleared — pinned agents will fail to spawn until a new one is saved' }));
    } catch { /* noop */ }
  };

  const remove = async (id: string) => {
    try {
      const r = await window.cth.claudeAccountRemove(id);
      if (r.ok) {
        setNote((s) => ({ ...s, [id]: '' }));
        await refreshConfig();
      } else setNote((s) => ({ ...s, [id]: r.error ?? 'failed' }));
    } catch (e) { setNote((s) => ({ ...s, [id]: e instanceof Error ? e.message : String(e) })); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div style={headStyle}>CLAUDE ACCOUNTS (SUBSCRIPTION POOL)</div>
        <div style={{ fontSize: 12, color: 'var(--cth-ink-700)', lineHeight: '18px' }}>
          Run different agents on different Claude subscriptions. For each account: run{' '}
          <code style={mono}>claude setup-token</code> in any terminal, sign in with that account in the
          browser, and paste the printed token here (needs Pro/Max/Team/Enterprise). Tokens are stored{' '}
          <strong>write-only</strong> (encrypted at rest; never shown again) and injected only into that
          agent&apos;s process at spawn. Agents without an account keep using this machine&apos;s{' '}
          <code style={mono}>/login</code> account. Pick <strong>Auto</strong> on an agent to let the pool
          choose the least-loaded healthy account; when an account hits its usage limit (429) its
          agents are moved to the next healthy one and resumed, and a rejected token (401) marks it
          dead until you paste a new one here.
        </div>
      </div>

      {accounts.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--cth-ink-500)' }}>
          No accounts yet — every agent runs on the login account.
        </div>
      )}

      {accounts.map((a) => {
        // Removal is blocked in MAIN while any live agent is pinned; surface the
        // same fact here so the button isn't a mystery when it errors.
        const pinnedHere = agents.filter((ag) => !ag.archived && ag.account === a.id).map((ag) => ag.name);
        if (config.godAccount === a.id) pinnedHere.push('Michael');
        return (
          <div key={a.id} style={{
            display: 'flex', flexDirection: 'column', gap: 4,
            padding: 8, background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ ...labelStyle, fontSize: 9 }}>{a.label}</span>
              <span style={{ fontSize: 11, color: hasToken[a.id] ? 'var(--cth-mint)' : 'var(--cth-coral)' }}>
                {hasToken[a.id] ? 'token stored ✓' : 'no token — pinned agents cannot spawn'}
              </span>
              {(() => {
                const h = pool?.accounts[a.id]?.health;
                if (!h || h.state === 'active') return null;
                return (
                  <span style={{ fontSize: 11, color: h.state === 'dead' ? 'var(--cth-coral)' : 'var(--cth-ink-700)' }}>
                    · {describeHealth(h, Date.now())}{h.state === 'dead' ? ' — paste a new token below to revive it' : ''}
                  </span>
                );
              })()}
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--cth-ink-300)', ...mono }}>{a.id}</span>
            </div>
            {pinnedHere.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>
                in use by {pinnedHere.join(', ')}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="password"
                autoComplete="off"
                placeholder={hasToken[a.id] ? '•••••••• (stored — paste to replace)' : 'paste setup-token'}
                value={draftToken[a.id] ?? ''}
                onChange={(e) => setDraftToken((s) => ({ ...s, [a.id]: e.target.value }))}
                style={inputStyle}
              />
              <PixelButton variant="secondary" size="sm" onClick={() => replaceToken(a.id)}>Save</PixelButton>
              {hasToken[a.id] && (
                <PixelButton variant="secondary" size="sm" onClick={() => clearToken(a.id)}>Clear</PixelButton>
              )}
              <PixelButton
                variant="destructive"
                size="sm"
                disabled={pinnedHere.length > 0}
                onClick={() => remove(a.id)}
              >
                <span title={pinnedHere.length > 0
                  ? `Blocked — still pinned to ${pinnedHere.join(', ')}`
                  : 'Remove this account and its stored token'}>Remove</span>
              </PixelButton>
            </div>
            {note[a.id] && <div style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>{note[a.id]}</div>}
          </div>
        );
      })}

      {/* Add account */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={labelStyle}>Add account</label>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            placeholder="label (e.g. Work · Max)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            style={{ ...inputStyle, maxWidth: 180 }}
          />
          <input
            type="password"
            autoComplete="off"
            placeholder="paste the token from `claude setup-token`"
            value={newToken}
            onChange={(e) => setNewToken(e.target.value)}
            style={inputStyle}
          />
          <PixelButton variant="primary" size="sm" onClick={add}>Add</PixelButton>
        </div>
        {addNote && <div style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>{addNote}</div>}
      </div>
    </div>
  );
}
