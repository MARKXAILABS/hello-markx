import { useState } from 'react';
// EVERY cross-directory import in this file is RELATIVE, and must stay that way.
// `test/load-ts.cjs`'s resolveTs handles `@shared/` and NOT `@/`, so one
// value-level `@/...` import here makes the component unloadable and
// test/team-review.test.cjs — which is the only thing proving the untrusted `goal`
// below actually reaches the screen — stops running. This is the constraint that
// keeps that assertion a render rather than a grep.
import { Modal } from './Modal';
import { PixelButton } from './PixelButton';
import { hireCommandFor, tokenizeCommand, inferAgentProvider, type HarnessConfig, type AgentProvider } from '../store/config';
import { spawnBatch, batchAgentIds, agentIdSlug } from '../hooks/bulkSpawn';
import { useStore, type Agent } from '../store/store';
import { OFFICE_CAST, DEFAULT_CHARACTER, type OfficeCharacterName } from '../scene/office/cast';
import type { AccentColorName } from '../design/tokens';
import type { HireManifest } from '@shared/hire';

const ACCENTS: AccentColorName[] = ['coral', 'mint', 'sky', 'lemon', 'lilac', 'peach'];

// `character` and `accent` ARE carried by a team file (they are in the exporter's
// allowlist), so a round-tripped team must keep them — but the VALIDATOR only
// length-caps and lowercases `character`, it does not constrain it to the cast.
// An untrusted file can therefore name a character that does not exist, which
// would land on the roster and reach the scene renderer. Same guard the
// single-hire form already applies; without it this path is the unguarded one.
const knownCharacter = (c?: string): OfficeCharacterName =>
  (OFFICE_CAST.some((m) => m.name === c) ? (c as OfficeCharacterName) : DEFAULT_CHARACTER);
const knownAccent = (a?: string): AccentColorName =>
  (ACCENTS.includes(a as AccentColorName) ? (a as AccentColorName) : 'sky');

export interface TeamReviewRow {
  member: HireManifest;
  checked: boolean;
  /** A visible reason the row starts off, or null. */
  note: string | null;
}

/**
 * Which rows start checked, and why any of them do not (UI-SPEC S3a).
 *
 * A PURE, EXPORTED function rather than logic inlined in JSX, for a measured
 * reason this repo keeps re-learning: `renderToStaticMarkup` fires no events, so a
 * rule that only exists inside a component's render closure is provable only by a
 * grep over the source — and a grep for a variable name is satisfied by code that
 * does nothing. Here it is driven directly.
 *
 * The FIRST occurrence of a name stays checked; only later duplicates default off.
 * Checking one back on is allowed — the operator may genuinely want two Jims — and
 * nothing further is asked, because the sheet IS the confirmation (UI-SPEC:263).
 *
 * Keyed on the SLUG, not the raw name, so it flags exactly the pairs that would be
 * confusable on the floor: agent identity is derived from the display name through
 * that same slug, so `Jim B` and `jim-b` are the same warning case as two literal
 * `Jim`s. It calls `agentIdSlug` rather than re-deriving the rule, so this warning
 * and the ids `batchAgentIds` actually mints cannot drift apart — a warning that
 * fired on non-colliding pairs would just train the operator to ignore it.
 */
export function markDuplicates(members: HireManifest[]): TeamReviewRow[] {
  const seen = new Set<string>();
  return members.map((member) => {
    const slug = agentIdSlug(member.name);
    const dup = seen.has(slug);
    seen.add(slug);
    return { member, checked: !dup, note: dup ? 'name taken' : null };
  });
}

/**
 * The copy a member that failed to spawn gets, on its own row (UI-SPEC
 * Copywriting:250, verbatim).
 *
 * Exported for the same reason `markDuplicates` and `exportOutcomeText` are: it is
 * set by a click handler, which a server render can never reach. The contract it
 * carries is that a bulk-hire failure is PER MEMBER and non-fatal — never one
 * sheet-level error that hides which member failed.
 */
export function memberFailureText(name: string, reason: string): string {
  return `${name} did not start: ${reason}. The rest of the team is hired — you can add ${name} on their own.`;
}

function basename(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p;
}

/** Everything one checked member turns into: the spawn call's arguments, and the
 *  roster entry to add if that call succeeds. */
export interface MemberHirePlan {
  request: {
    id: string;
    cwd: string;
    command: string;
    provider: AgentProvider;
    args: string[];
    cols: number;
    rows: number;
    isolate: boolean;
    hive: {
      id: string;
      name: string;
      provider: AgentProvider;
      cwd: string;
      role?: string;
      capabilities?: string[];
    };
  };
  agent: Agent;
}

/**
 * Turn one validated team member into its spawn request and its roster entry.
 *
 * A PURE, EXPORTED function for the reason 03-04 recorded when it pulled
 * `exportOutcomeText` out of a click handler: `renderToStaticMarkup` fires no
 * events, so anything that only exists inside the `hire` handler below is provable
 * only by a grep over the source — and a grep for a field name is satisfied by code
 * that assigns it the wrong thing. These three mappings are exactly the ones worth
 * more than a grep:
 *
 *   - `role` COMES FROM `description`, NEVER FROM `goal`. Both existing spawn paths
 *     agree (the single-hire form and restoreTeam), and `role` is interpolated into
 *     `<agentDir>/identity.md` on every spawn. Writing `goal` there instead would
 *     silently move a 4,000-character untrusted field into the agent's identity.
 *   - `goal` rides along as the ROSTER agent's own `goal` — its standing directive.
 *   - `cwd` is the ONE operator-picked root, threaded into both the spawn and the
 *     hive descriptor for every member (D-19). Without it main's own guard rejects
 *     the spawn, and the blast radius of the import would be unreviewed.
 *
 * The command is rebuilt LOCALLY from the provider preset, so a manifest can never
 * name the binary that executes.
 */
export function memberHirePlan(
  m: HireManifest,
  id: string,
  cwd: string,
  config: HarnessConfig
): MemberHirePlan {
  const provider: AgentProvider = m.provider ?? inferAgentProvider(config.defaultCommand);
  const command = hireCommandFor(m, config);
  const [exe, ...args] = tokenizeCommand(command);
  const ptyId = `pty-${id}`;
  return {
    request: {
      id: ptyId,
      cwd,
      command: exe,
      provider,
      args,
      cols: 100,
      rows: 30,
      // Never isolation the operator did not ask for.
      isolate: false,
      // A manifest may carry validated capability tags (routing hints). They live
      // on the HIVE descriptor, not the roster agent — same as the single-hire path.
      hive: { id, name: m.name, provider, cwd, role: m.description, capabilities: m.capabilities }
    },
    agent: {
      id,
      name: m.name,
      character: knownCharacter(m.character),
      accent: knownAccent(m.accent),
      description: m.description ?? 'a fresh harness',
      project: basename(cwd),
      tmuxTarget: '',
      cwd,
      goal: m.goal,
      status: 'idle',
      action: 'starting up',
      progress: 0,
      currentStation: 'desk',
      ptyId,
      command,
      provider,
      model: m.model,
      recentTextTs: Date.now()
    }
  };
}

export interface TeamReviewModalProps {
  /** Already validated and bounded to TEAM_MAX_MEMBERS by `validateTeamManifest`
   *  (03-04) before this component ever sees it. */
  members: HireManifest[];
  config: HarnessConfig;
  /** ONE operator-picked root for the WHOLE team (D-19 — never per member).
   *  Undefined/empty disables the hire. */
  cwd?: string;
  onClose: () => void;
}

/**
 * The team@1 import review sheet (UI-SPEC S3a).
 *
 * This sheet is the ONLY confirmation a bulk hire gets (`03-UI-SPEC.md:263`), which
 * decides what it must show. Two of a member's fields are untrusted, near-unbounded
 * and both reach the spawned agent:
 *
 *   - `description` becomes `hive.role`, which is interpolated into identity.md and
 *     rewritten on EVERY spawn;
 *   - `goal` becomes the hired agent's standing directive, capped only at 4,000
 *     characters by `src/shared/hire.ts`.
 *
 * So both render IN FULL, wrapping, inside a height-bounded scroll region — never
 * behind the summary line's ellipsis, which is exactly where 3,900 characters of
 * someone else's instructions would hide behind a tidy-looking row. The one-line
 * ellipsized summary S3a specifies stays as the row's summary; the review region
 * sits beneath it.
 *
 * `commandFlags`, `skills` and `mcpServers` are NOT rendered because they are NOT
 * PRESENT: `validateTeamManifest` deletes all three from every member, precisely
 * because the team path has no per-member review surface for them. `mcpServers` is
 * the one that mattered — a write/secret-tier catalog id raises `consentRequired` on
 * the single-manifest path, and the team validator has no consent channel at all.
 * Do not reintroduce them here without building that channel first.
 */
export function TeamReviewModal({ members, config, cwd, onClose }: TeamReviewModalProps) {
  const [rows] = useState<TeamReviewRow[]>(() => markDuplicates(members));
  const [checked, setChecked] = useState<boolean[]>(() => markDuplicates(members).map((r) => r.checked));
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);

  const n = checked.filter(Boolean).length;
  const canHire = Boolean(cwd) && n > 0 && !busy;

  const toggle = (i: number): void => {
    setChecked((prev) => prev.map((c, j) => (j === i ? !c : c)));
  };

  /** Hire every checked member CONCURRENTLY, in file order, with one member's
   *  failure never touching the rest — all three of which are `spawnBatch`'s job,
   *  not re-derived here (D-18). */
  const hire = async (): Promise<void> => {
    if (!cwd || !n) return;
    setBusy(true);
    setDone(0);
    setErrors({});
    const picked = rows
      .map((row, index) => ({ row, index }))
      .filter(({ index }) => checked[index]);
    // ONE call, synchronously, before any spawn fires — every id in the batch is
    // minted from one clock reading and disambiguated against the others. This is
    // the exported production generator test/bulk-spawn.test.cjs drives; deriving
    // ids inline here would put the tested path and the shipped path back apart.
    const ids = batchAgentIds(picked.map(({ row }) => row.member.name), Date.now());
    const failed: Record<number, string> = {};

    const batch = await spawnBatch(picked, async ({ row, index }, i): Promise<Agent | null> => {
      const { request, agent } = memberHirePlan(row.member, ids[i], cwd, config);
      const res = await window.cth.spawnPty(request);
      if (!res.ok) {
        failed[index] = memberFailureText(row.member.name, res.error ?? 'spawn failed');
        return null;
      }
      setDone((d) => d + 1);
      // Main expands `~` at ingestion and echoes back the absolute path it actually
      // spawned into — record THAT, so this agent's cwd matches the hive registry.
      // Crush hands its hive protocol back here rather than on argv.
      const spawnedCwd = res.cwd || cwd;
      return { ...agent, cwd: spawnedCwd, project: basename(spawnedCwd), seedPrompt: res.seedPrompt };
    });

    // Added in FILE order, not completion order — that order is persisted.
    for (const agent of batch.ok) useStore.getState().addAgent(agent);
    // A throw that escaped the per-member handler above still belongs on a row.
    batch.failures.forEach((msg, i) => {
      const idx = picked[i]?.index;
      if (idx !== undefined && !failed[idx]) failed[idx] = msg;
    });
    setBusy(false);
    setErrors(failed);
    if (!Object.keys(failed).length) onClose();
  };

  const label = 'var(--cth-ink-500)';

  return (
    // Opens OVER AddAgentModal, which sits at 500 to clear the fullscreen
    // terminal/file overlays. Escape closes this sheet only — the Modal
    // primitive answers it top-first. `locked` while a hire is in flight.
    <Modal title="Import team" onClose={onClose} width={560} zIndex={520} locked={busy}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cth-space-2)' }}>
        <span style={{ fontSize: 'var(--cth-text-body-md)', color: 'var(--cth-ink-700)' }}>
          {members.length} agents in this file. Uncheck anyone you do not want.
        </span>

        {/* The folder region. `cwd` is the field that decides the blast radius of a
            team import — which directory up to TEAM_MAX_MEMBERS agents from an
            untrusted file get read/write access to — so it is shown as literal
            text, not implied. */}
        <span style={{ fontSize: 'var(--cth-text-body-sm)', color: label }}>
          {cwd ? `Every member is hired into ${cwd}` : 'Pick a folder first'}
        </span>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cth-space-2)', maxHeight: '46vh', overflow: 'auto' }}>
          {rows.map((row, i) => (
            <label
              key={i}
              style={{
                display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer',
                padding: '6px 8px', background: 'var(--cth-cream-100)',
                boxShadow: 'inset 0 0 0 1px var(--cth-ink-900)'
              }}
            >
              <input type="checkbox" checked={checked[i]} onChange={() => toggle(i)} disabled={busy} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: 'var(--cth-text-display-md)', lineHeight: 'var(--cth-lh-display-md)', textTransform: 'uppercase' }}>
                  {row.member.name}
                  {row.note ? (
                    <span style={{ fontSize: 'var(--cth-text-body-sm)', color: label, textTransform: 'none' }}> — {row.note}</span>
                  ) : null}
                </span>
                <span style={{ fontSize: 'var(--cth-text-body-sm)', color: label }}>
                  {row.member.provider ?? 'claude'}{row.member.model ? ` · ${row.member.model}` : ''}
                </span>
                {/* S3a's summary line, ellipsized exactly as specified. */}
                <span style={{
                  fontSize: 'var(--cth-text-body-md)', color: 'var(--cth-ink-700)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                }}>
                  {row.member.description ?? 'a fresh harness'}
                </span>
                {/* THE REVIEW REGION — an addition beneath S3a's summary line, not a
                    contradiction of it. Everything this member is about to hand the
                    spawned agent, in full, wrapping, scrolling inside its own row so
                    a 4,000-character goal cannot grow the sheet off-screen. */}
                <span style={{
                  display: 'flex', flexDirection: 'column', gap: 2,
                  maxHeight: 132, overflow: 'auto',
                  fontSize: 'var(--cth-text-body-sm)', color: 'var(--cth-ink-700)',
                  whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                  padding: '4px 6px', background: 'var(--cth-cream-300)'
                }}>
                  <span><span style={{ color: label }}>role: </span>{row.member.description ?? 'a fresh harness'}</span>
                  {/* An explicit note rather than an empty gap, so "there is nothing
                      to read" stays distinguishable from "the field was dropped". */}
                  <span><span style={{ color: label }}>goal: </span>{row.member.goal ?? 'no goal'}</span>
                </span>
                {errors[i] ? (
                  <span style={{ fontSize: 'var(--cth-text-body-sm)', color: 'var(--cth-coral-700)' }}>{errors[i]}</span>
                ) : null}
              </span>
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <PixelButton variant="ghost" size="md" onClick={onClose} disabled={busy}>cancel</PixelButton>
          <PixelButton variant="primary" size="md" onClick={hire} disabled={!canHire}>
            {busy ? `hiring ${done}/${n}…` : `hire ${n}`}
          </PixelButton>
        </div>
      </div>
    </Modal>
  );
}
