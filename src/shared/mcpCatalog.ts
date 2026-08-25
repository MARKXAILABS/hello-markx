/**
 * Default MCP server catalog (Workstream 3). A dependency-free, importable-by-both
 * (main + renderer) registry of the MCP servers Hello MarkX can wire into each
 * agent. Keep it free of electron/UI/node imports.
 *
 * MEASURED (scripts/mcp-live-probe.cjs, claude 2.1.236, plan 02-11): an
 * `mcpServers` key inside a `--settings <file>.json` file is ignored — Claude
 * Code never spawns that server. The bundle is written instead to
 * `<agentDir>/mcp.json` and passed via `--mcp-config <file>` at hive.ts's
 * bootstrap seam (DAEMON-04). Re-run the probe before ever trusting the
 * `--settings` channel again.
 *
 * Tiers gate consent:
 *   - 'safe-readonly' → no secret, no destructive write OUTSIDE the agent cwd; shipped
 *                       ON by default (`defaultEnabled:true`). `filesystem`/`git` are
 *                       scoped to the agent cwd at merge time (never whole-disk).
 *   - 'write'         → can mutate state beyond the workspace; OFF by default,
 *                       consent-gated.
 *   - 'secret'        → needs an API key / token / connection string; OFF by default,
 *                       consent-gated.
 *
 * The actual merge (catalog ∩ enabled, cwd-scoping of filesystem/git, id namespacing,
 * non-fatal resolution) is Workstream 3's `buildDefaultMcpServers`/`hookSettings`
 * job — this module only declares the entries, their tiers, and the seed defaults.
 *
 * NOTE: several reference servers ship as Python (uvx) rather than npm (npx). The
 * commands below reflect each server's real transport; entries that couldn't be
 * verified against an installed server are flagged `// TODO-verify`. Workstream 3
 * makes a server that fails to resolve non-fatal to the agent.
 */

export type McpTier = 'safe-readonly' | 'write' | 'secret';

export interface McpCatalogEntry {
  /** Stable catalog id (also the consent key in `config.mcpDefaults`). The merge
   *  step namespaces the written server id (e.g. `hellomarkx-<id>`) to avoid clobbering
   *  a user's own `~/.claude` MCP server of the same name. */
  id: string;
  /** Human label for the consent UI. */
  label: string;
  /** One-line description for the consent UI / hire import preview. */
  description: string;
  /** The MCP stdio server launch spec. `filesystem`/`git` carry a placeholder cwd
   *  arg that Workstream 3 replaces with the agent cwd at merge time. */
  spec: {
    command: string;
    args: string[];
    /** Required env (e.g. an API token). Present only on write/secret entries; the
     *  value is supplied via consent, never hard-coded here. */
    env?: Record<string, string>;
  };
  tier: McpTier;
  /** Seed for `config.mcpDefaults[id].enabled`. Always === (tier === 'safe-readonly'). */
  defaultEnabled: boolean;
}

/** The default MCP bundle. Safe/read-only servers are ON; anything that writes
 *  beyond the workspace or needs a secret is OFF until the user consents. */
export const MCP_CATALOG: McpCatalogEntry[] = [
  // ─── Safe, read-only, no-secret — shipped ON ──────────────────────────────
  {
    id: 'sequential-thinking',
    label: 'Sequential Thinking',
    description: 'Structured step-by-step reasoning scratchpad. No I/O, no secrets.',
    spec: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'] },
    tier: 'safe-readonly',
    defaultEnabled: true
  },
  {
    id: 'time',
    label: 'Time',
    description: 'Current time and timezone conversions.',
    // Reference time server ships as Python. // TODO-verify transport (uvx vs an npm port)
    spec: { command: 'uvx', args: ['mcp-server-time'] },
    tier: 'safe-readonly',
    defaultEnabled: true
  },
  {
    id: 'fetch',
    label: 'Fetch',
    description: 'Fetch a URL and return its content as markdown (read-only HTTP GET).',
    // Reference fetch server ships as Python. // TODO-verify transport (uvx vs an npm port)
    spec: { command: 'uvx', args: ['mcp-server-fetch'] },
    tier: 'safe-readonly',
    defaultEnabled: true
  },
  {
    id: 'context7',
    label: 'Context7 Docs',
    description: 'Up-to-date library/framework documentation lookups.',
    spec: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
    tier: 'safe-readonly',
    defaultEnabled: true
  },
  {
    id: 'filesystem',
    label: 'Filesystem (cwd)',
    description: 'Read/edit files within the agent workspace only (scoped to cwd at spawn).',
    // The trailing arg is the allowed root — Workstream 3 replaces this placeholder
    // with the agent cwd at merge time so it is NEVER whole-disk.
    spec: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '<cwd>'] },
    tier: 'safe-readonly',
    defaultEnabled: true
  },
  {
    id: 'git',
    label: 'Git (cwd)',
    description: 'Inspect git status/log/diff for the workspace repo (scoped to cwd at spawn).',
    // Reference git server ships as Python; `--repository <cwd>` is set at merge time.
    // TODO-verify transport (uvx vs an npm port).
    spec: { command: 'uvx', args: ['mcp-server-git', '--repository', '<cwd>'] },
    tier: 'safe-readonly',
    defaultEnabled: true
  },

  // ─── Write / secret — shipped OFF, consent-gated ──────────────────────────
  {
    id: 'github-token',
    label: 'GitHub',
    description: 'Read/write GitHub issues, PRs, and repos. Requires a personal access token.',
    spec: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' }
    },
    tier: 'secret',
    defaultEnabled: false
  },
  {
    id: 'db',
    label: 'Database',
    description: 'Query a SQL database. Requires a connection string.',
    // TODO-verify exact server package for the user's DB engine (Postgres assumed).
    spec: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres'],
      env: { DATABASE_URL: '' }
    },
    tier: 'secret',
    defaultEnabled: false
  },
  {
    id: 'email-calendar',
    label: 'Email & Calendar',
    description: 'Read/send mail and read/write calendar events. Requires account credentials.',
    // TODO-verify provider package (Gmail/Google Calendar assumed).
    spec: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-gsuite'], env: { GOOGLE_OAUTH_TOKEN: '' } },
    tier: 'secret',
    defaultEnabled: false
  },
  {
    id: 'search-with-key',
    label: 'Web Search',
    description: 'Keyed web search. Requires a search-provider API key.',
    // TODO-verify provider package (Brave Search assumed).
    spec: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'], env: { BRAVE_API_KEY: '' } },
    tier: 'secret',
    defaultEnabled: false
  }
];

/** Look up a catalog entry by id. */
export function mcpCatalogEntry(id: string): McpCatalogEntry | undefined {
  return MCP_CATALOG.find((e) => e.id === id);
}

/** Whether an id is a known safe-readonly server (the only tier a hire manifest may
 *  request without surfacing for human consent — Workstream 3 validation). */
export function isSafeReadonlyMcp(id: string): boolean {
  return mcpCatalogEntry(id)?.tier === 'safe-readonly';
}

/** Seed for `DEFAULTS.mcpDefaults` — derived from the catalog so the two never
 *  drift (safe-readonly ON, write/secret OFF). */
export function defaultMcpDefaults(): Record<string, { enabled: boolean }> {
  const out: Record<string, { enabled: boolean }> = {};
  for (const e of MCP_CATALOG) out[e.id] = { enabled: e.defaultEnabled };
  return out;
}

/** The single derivation of an MCP grant's secret ref key, shared by
 *  `mcp:grant`, `mcp:revoke` and `resetConfig`'s sweep (D-28) — so those three
 *  call sites can never key an agent-server pair three slightly different
 *  ways. Always used as `secretRefFor(mcpGrantKey(agentId, mcpId))`; nothing
 *  else may construct one of these refs. */
export function mcpGrantKey(agentId: string, mcpId: string): string {
  return `mcp:${agentId}:${mcpId}`;
}

/** The prefix every MCP grant key shares — `secretRefFor(MCP_GRANT_PREFIX)` is
 *  what `resetConfig` sweeps to drop the whole grant-secret family without
 *  enumerating every agent/server pair that ever existed. */
export const MCP_GRANT_PREFIX = 'mcp:';

/** Providers whose spawn path actually writes `<agentDir>/mcp.json` and passes
 *  `--mcp-config` — the one channel `scripts/mcp-live-probe.cjs` live-verified
 *  (D-25). D-26: nine other engines have a DOCUMENTED per-agent MCP surface
 *  and NONE of them are wired here. This answers "does this build write this
 *  engine's channel" — a different question from Rule C-1b's `supportsMcp` on
 *  the provider preset (`src/shared/agentProvider.ts`, plan 02-07's file, not
 *  this one), which answers "can this engine take MCP at all". Conflating the
 *  two is how a capability card starts lying about a channel nothing writes. */
export const MCP_WIRED_PROVIDERS: readonly string[] = ['claude'];

/** Whether `provider`'s spawn path is one of the wired channels above. Typed
 *  as a bare `string` (not `AgentProvider`) so this module never imports
 *  `agentProvider.ts` and stays dependency-free. */
export function mcpWiredFor(provider: string): boolean {
  return MCP_WIRED_PROVIDERS.includes(provider);
}

/** MAIN-02. `agentId` reaches `mcp:agentState`/`mcp:grant`/`mcp:revoke` from the
 *  RENDERER — the less-trusted side of that boundary by design — and then selects
 *  both a secret-store namespace (`mcpGrantKey`) and a filesystem path
 *  (`HiveManager.agentDir` = `join(root, 'agents', id)`). A bare
 *  `typeof id === 'string'` check defends neither: `'../agents/someone-else'` is a
 *  perfectly good string, and was MEASURED returning another agent's armed server
 *  list before this guard existed.
 *
 *  Deliberately a SHAPE guard, NOT a membership guard. Membership was tried first
 *  and was wrong: `hive.registry()` is not the agent roster. `spawnAgentCore` only
 *  calls `hive.ensureAgent` under `if (opts.hive && hive.enabled())`, and its
 *  missing-CLI installer rung returns earlier still, while the renderer persists
 *  the agent card either way — so a registry test rejects real, working, non-hive
 *  agents and breaks DAEMON-04's consent modal for them.
 *
 *  The charset is a superset of everything `uniqueId()` can emit
 *  (`pty-<name-slug>-<base36>`, i.e. `[a-z0-9-]`), so it cannot reject a
 *  legitimate id, while excluding every separator and traversal form. `..` is
 *  refused explicitly because `.` is otherwise a legal character in the class.
 *
 *  Lives here rather than in `index.ts` so it has a testable seam — `index.ts`
 *  imports `electron` at module scope and cannot be loaded by `node --test`. */
const SAFE_AGENT_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;
export function isSafeAgentId(id: unknown): id is string {
  return typeof id === 'string' && SAFE_AGENT_ID_RE.test(id) && !id.includes('..');
}
