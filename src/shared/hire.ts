/**
 * Shareable "hires" — portable agent role templates (manifest spec v1).
 *
 * A hire manifest is a small JSON document that describes a role-configured
 * agent (name, provider, model, flags, goal, budget) so it can be shared as a
 * file or hosted in a community gallery and imported with one click via the
 * `hellomarkx://hire?src=<https-url>` deep link or an in-app file picker.
 *
 * SECURITY MODEL — a manifest is untrusted input:
 *   - It can NEVER auto-spawn an agent. Importing only pre-fills the Add-Agent
 *     modal; the human reviews the final command and clicks spawn.
 *   - It cannot carry a raw executable/command. The spawn binary always comes
 *     from the locally configured provider preset; a manifest may only append
 *     flag-shaped arguments (validated below), which the modal shows in full.
 *   - All fields are length/shape-capped here, in one dependency-free module
 *     shared by main (deep link / file import) and renderer (prefill).
 *   - `skills` and `mcpServers` are references into the BUNDLED allowlists only —
 *     never raw specs. This is the same threat model as `commandFlags`: a manifest
 *     can never inject an arbitrary executable path, env var, or MCP spec.
 *     Write/secret MCP servers are surfaced for human consent at import, never
 *     auto-enabled (consistent with "import only pre-fills; human clicks spawn").
 */

import { AGENT_PROVIDER_PRESETS, type AgentProvider } from './agentProvider';
import { mcpCatalogEntry } from './mcpCatalog';

export const HIRE_SPEC_V1 = 'hello-markx/hire@1';

/** Skill ids bundled in app resources (the only values a hire manifest may request
 *  in the `skills` field). A manifest can never name an arbitrary skill path —
 *  only these curated, read-only, no-secret skill ids are allowlisted. */
export const BUNDLED_SKILL_IDS: ReadonlySet<string> = new Set([
  'md-hive-sync',
  'md-fetch-summarize',
  'md-audit'
]);

/** Providers a manifest may request: every `AgentProvider` EXCEPT `'custom'`
 *  ('agy' is still accepted as an alias for 'antigravity').
 *
 *  `'custom'` is the one deliberate exclusion, and the only one that is a real
 *  security boundary — it would let a manifest choose an arbitrary local binary.
 *  Every other engine (grok, kimi, qwen, opencode, crush, pi, copilot) was
 *  excluded only because this allowlist was hand-typed with three entries while
 *  `agentProvider.ts` grew to eleven. That was an oversight, not a second
 *  boundary: it made `team:export` produce files the app's own validator then
 *  rejected on `provider`. The set is now DERIVED from AGENT_PROVIDER_PRESETS
 *  (below) so a twelfth engine cannot silently reopen the same gap. */
export type HireProvider = Exclude<AgentProvider, 'custom'>;

export interface HireManifest {
  /** Spec tag; exactly `hello-markx/hire@1` for this version. */
  spec: typeof HIRE_SPEC_V1;
  /** Agent display name (also seeds the hive id). Required. */
  name: string;
  /** One-line role, e.g. "Documentation writer" — lands in identity.md + card. */
  description?: string;
  /** The standing goal/mission text pre-filled into the goal field. */
  goal?: string;
  /** Office cast sprite id (e.g. 'pam'); unknown values fall back to default. */
  character?: string;
  /** Accent color name (e.g. 'mint'); unknown values fall back to default. */
  accent?: string;
  /** Which CLI the role is designed for. Default: the user's default provider. */
  provider?: HireProvider;
  /** Model id/label for that provider (e.g. 'claude-sonnet-4-6'). */
  model?: string;
  /** Extra flag-shaped args appended to the locally-built spawn command. Each flag
   *  must be in the safe-flag allowlist (see SAFE_FLAG_NAMES) and shell-metachar-free;
   *  anything else rejects the manifest (the command stays editable post-import). */
  commandFlags?: string[];
  /** Capability tags for the hive registry (routing hints). */
  capabilities?: string[];
  /** Spawn in an isolated git worktree. */
  isolate?: boolean;
  /** Per-agent total-token ceiling, applied to agentTokenCaps after spawn. */
  tokenCap?: number;
  /** Attribution shown in the import preview. */
  author?: string;
  /** Manifest home (gallery page). https only. */
  homepage?: string;
  /** Bundled skill ids to activate in the agent's workspace. References into
   *  BUNDLED_SKILL_IDS only — never raw file paths or arbitrary skill names. */
  skills?: string[];
  /** Default MCP catalog ids to enable for this agent. References into the
   *  MCP_CATALOG allowlist only — never raw specs. Safe-readonly ids are
   *  pre-filled; write/secret ids are surfaced for human consent at import
   *  and never auto-enabled. */
  mcpServers?: string[];
}

export interface HireValidation {
  ok: boolean;
  manifest?: HireManifest;
  errors: string[];
  /** MCP catalog ids present in the manifest's `mcpServers` that are NOT
   *  safe-readonly (write or secret tier). These must be surfaced to the human
   *  for explicit consent before they are enabled — they are NEVER auto-enabled. */
  consentRequired?: string[];
}

/** Derived from the canonical preset list, never hand-maintained — the two can
 *  then not drift apart. `'custom'` is filtered out; see HireProvider. */
const PROVIDERS: readonly string[] = AGENT_PROVIDER_PRESETS
  .map((p) => p.id)
  .filter((id) => id !== 'custom');
const MAX_BYTES = 64 * 1024;

/** A flag ("-x", "--flag", "--flag=value") or a bare value token that may follow
 *  a flag. Letters/digits plus a conservative punctuation set; no quotes,
 *  backticks, semicolons, pipes, ampersands, redirects, percent (cmd.exe
 *  %VAR% env-expansion), or whitespace. Args are passed to node-pty as argv
 *  (no shell), so this is defense in depth. */
const FLAG_RE = /^[A-Za-z0-9._\/=:,@+-]{1,100}$/;

/** Allowed characters in a model id/label. Model values flow into the spawn
 *  command line (`--model <value>`), so this MUST reject shell metacharacters —
 *  on Windows a `.cmd`/`.bat` provider shim routes the command through cmd.exe,
 *  where an unquoted `&`/`|`/`^`/`<`/`>`/`(`/`)` would chain a second command.
 *  Real model ids/labels only need letters, digits, spaces, and a little
 *  punctuation: `claude-sonnet-4-6[1m]`, `Gemini 3.1 Pro (High)`. No quotes,
 *  backticks, `$`, `;`, `&`, `|`, `^`, `<`, `>`, `%`, `!`. (The command field
 *  stays editable, so a legitimate exotic value can still be typed by hand.) */
const MODEL_RE = /^[A-Za-z0-9 ._()[\]\/:@+-]{1,80}$/;

/** Flags a manifest is ALLOWED to append — a default-deny ALLOWLIST.
 *
 *  WHY AN ALLOWLIST: a manifest's `provider` is attacker-chosen and each CLI keeps
 *  adding flags, so a denylist of "dangerous" flags drifts and leaks (three rounds
 *  of re-review each found one more spelling that escaped — codex `-a`/`-s`, then
 *  `-c model_providers.*.base_url=…` backend-redirect credential exfil, then
 *  `--provider`). Default-deny closes the CLASS: only flags that PROVABLY cannot
 *  escalate permissions, redirect the backend / exfil credentials, read/write
 *  arbitrary files, inject prompt/config/MCP, or run commands may pass; every
 *  other flag-shaped token rejects the manifest outright.
 *
 *  These names are the curated SAFE set, mined from the provider command
 *  references (claudeCommands.ts / codexCommands.ts) and presets
 *  (agentProvider.ts). The list is deliberately tiny — biased hard to EXCLUDE,
 *  because the spawn command stays editable after import, so a user who needs an
 *  exotic flag can add it by hand. Each is behavioral / output / a safety-cap
 *  only, with a single non-escalating value (or none):
 *    --model          select the model id           (claude/codex/agy modelFlag)
 *    --max-turns      cap agentic turns (runaway guard, strictly safety-↑)
 *    --output-format  headless output shape: text / json / stream-json
 *    --verbose        logging verbosity only
 *  Matched case-insensitively against the flag NAME (part before any `=`), so both
 *  `--flag value` and `--flag=value` are covered. NOTHING permission / sandbox /
 *  approval / dir / config (incl. codex `-c`) / mcp / provider / base-url /
 *  system-prompt / settings related is ever allowlisted. */
const SAFE_FLAG_NAMES: ReadonlySet<string> = new Set([
  '--model',
  '--max-turns',
  '--output-format',
  '--verbose'
]);

/** True if a commandFlags token is an allowed flag. Handles `--x` and `--x=value`
 *  (matches the NAME before `=`, case-insensitive); short `-x` forms are not in
 *  the allowlist and so are rejected by default. */
function isSafeFlag(token: string): boolean {
  if (!token.startsWith('-')) return false;
  const name = token.split('=', 1)[0].toLowerCase();
  return SAFE_FLAG_NAMES.has(name);
}

function str(v: unknown): v is string { return typeof v === 'string'; }

function capped(v: unknown, max: number, field: string, errors: string[], required = false): string | undefined {
  if (v === undefined || v === null) {
    if (required) errors.push(`"${field}" is required`);
    return undefined;
  }
  if (!str(v)) { errors.push(`"${field}" must be a string`); return undefined; }
  const t = v.trim();
  if (required && !t) { errors.push(`"${field}" must not be empty`); return undefined; }
  if (t.length > max) { errors.push(`"${field}" exceeds ${max} chars`); return undefined; }
  return t || undefined;
}

/** Validate an untrusted parsed JSON value into a HireManifest. Pure; no I/O. */
export function validateHireManifest(raw: unknown): HireValidation {
  const errors: string[] = [];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ['manifest must be a JSON object'] };
  }
  const o = raw as Record<string, unknown>;

  if (o.spec !== HIRE_SPEC_V1) {
    return { ok: false, errors: [`unsupported spec "${String(o.spec)}" (expected "${HIRE_SPEC_V1}")`] };
  }

  const name = capped(o.name, 40, 'name', errors, true);
  const description = capped(o.description, 200, 'description', errors);
  const goal = capped(o.goal, 4000, 'goal', errors);
  const character = capped(o.character, 24, 'character', errors)?.toLowerCase();
  const accent = capped(o.accent, 24, 'accent', errors)?.toLowerCase();
  const model = capped(o.model, 80, 'model', errors);
  if (model !== undefined && !MODEL_RE.test(model)) {
    errors.push('"model" contains disallowed characters (it goes onto the spawn command line; letters, digits, spaces and . _ - ( ) [ ] / : @ + only)');
  }
  const author = capped(o.author, 80, 'author', errors);
  const homepage = capped(o.homepage, 300, 'homepage', errors);

  let provider: HireProvider | undefined;
  if (o.provider !== undefined) {
    const p = str(o.provider) ? (o.provider === 'agy' ? 'antigravity' : o.provider) : o.provider;
    if (str(p) && PROVIDERS.includes(p)) provider = p as HireProvider;
    else errors.push(`"provider" must be one of ${PROVIDERS.join(', ')} (or "agy")`);
  }

  let commandFlags: string[] | undefined;
  if (o.commandFlags !== undefined) {
    if (!Array.isArray(o.commandFlags) || o.commandFlags.length > 16) {
      errors.push('"commandFlags" must be an array of at most 16 items');
    } else {
      commandFlags = [];
      // DEFAULT-DENY: every flag-shaped token must name an allowlisted safe flag;
      // a bare token is allowed only as the value immediately following an allowed
      // `--flag` (so a value can never smuggle in a second, unknown flag).
      let valueAllowed = false; // previous token was an allowed `--flag` (no inline =)
      for (let i = 0; i < o.commandFlags.length; i++) {
        const f = o.commandFlags[i];
        if (!str(f) || !FLAG_RE.test(f)) {
          errors.push(`commandFlags entry ${JSON.stringify(f)} is not a safe flag token`);
          valueAllowed = false;
          continue;
        }
        // The FIRST entry must be flag-shaped (defense in depth; kept explicit).
        if (i === 0 && !f.startsWith('-')) {
          errors.push('"commandFlags" must start with a flag (e.g. "--model")');
          valueAllowed = false;
          continue;
        }
        if (f.startsWith('-')) {
          if (!isSafeFlag(f)) {
            errors.push(`commandFlags entry ${JSON.stringify(f)} is not in the shared-hire safe-flag list — for safety a shared hire may only embed known-harmless flags (${[...SAFE_FLAG_NAMES].join(', ')}). If you need this flag, add it by hand in the command field after importing.`);
            valueAllowed = false;
            continue;
          }
          commandFlags.push(f);
          valueAllowed = !f.includes('='); // a `--flag value` form may take one value next
        } else {
          if (!valueAllowed) {
            errors.push(`commandFlags entry ${JSON.stringify(f)} is not allowed here (a value may only follow an allowed flag such as "--model")`);
            continue;
          }
          commandFlags.push(f);
          valueAllowed = false; // consume the value; no chained second value
        }
      }
      if (commandFlags.length === 0) commandFlags = undefined;
    }
  }

  let capabilities: string[] | undefined;
  if (o.capabilities !== undefined) {
    if (!Array.isArray(o.capabilities) || o.capabilities.length > 12) {
      errors.push('"capabilities" must be an array of at most 12 items');
    } else {
      capabilities = o.capabilities.filter(str).map(c => c.trim().slice(0, 40)).filter(Boolean);
      if (capabilities.length === 0) capabilities = undefined;
    }
  }

  let isolate: boolean | undefined;
  if (o.isolate !== undefined) {
    if (typeof o.isolate === 'boolean') isolate = o.isolate;
    else errors.push('"isolate" must be a boolean');
  }

  let tokenCap: number | undefined;
  if (o.tokenCap !== undefined) {
    if (typeof o.tokenCap === 'number' && Number.isInteger(o.tokenCap) && o.tokenCap > 0 && o.tokenCap <= 1e10) tokenCap = o.tokenCap;
    else errors.push('"tokenCap" must be a positive integer (max 1e10)');
  }

  // skills — allowlist: references into BUNDLED_SKILL_IDS only; max 8
  let skills: string[] | undefined;
  if (o.skills !== undefined) {
    if (!Array.isArray(o.skills) || o.skills.length > 8) {
      errors.push('"skills" must be an array of at most 8 items');
    } else {
      skills = [];
      for (const s of o.skills) {
        if (!str(s) || !s.trim()) { errors.push('"skills" entries must be non-empty strings'); continue; }
        const id = s.trim();
        if (!BUNDLED_SKILL_IDS.has(id)) {
          errors.push(`"skills" entry ${JSON.stringify(id)} is not a bundled skill id — a hire may only reference the built-in safe skills (${[...BUNDLED_SKILL_IDS].join(', ')})`);
        } else {
          skills.push(id);
        }
      }
      if (skills.length === 0) skills = undefined;
    }
  }

  // mcpServers — allowlist: references into MCP_CATALOG only; max 8; write/secret surfaced for consent
  let mcpServers: string[] | undefined;
  const consentRequired: string[] = [];
  if (o.mcpServers !== undefined) {
    if (!Array.isArray(o.mcpServers) || o.mcpServers.length > 8) {
      errors.push('"mcpServers" must be an array of at most 8 items');
    } else {
      mcpServers = [];
      for (const s of o.mcpServers) {
        if (!str(s) || !s.trim()) { errors.push('"mcpServers" entries must be non-empty strings'); continue; }
        const id = s.trim();
        const entry = mcpCatalogEntry(id);
        if (!entry) {
          errors.push(`"mcpServers" entry ${JSON.stringify(id)} is not a known catalog id — a hire may only reference built-in MCP servers`);
        } else {
          mcpServers.push(id);
          if (entry.tier !== 'safe-readonly') consentRequired.push(id);
        }
      }
      if (mcpServers.length === 0) mcpServers = undefined;
    }
  }

  if (homepage && !homepage.startsWith('https://')) errors.push('"homepage" must be https');

  if (errors.length > 0 || !name) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    consentRequired: consentRequired.length > 0 ? consentRequired : undefined,
    manifest: { spec: HIRE_SPEC_V1, name, description, goal, character, accent, provider, model, commandFlags, capabilities, isolate, tokenCap, author, homepage, skills, mcpServers }
  };
}

// ─── team@1 — a wrapper around N hire@1 members ──────────────────────────────

export const HIRE_TEAM_SPEC_V1 = 'hello-markx/team@1';

/** Most members one team file may carry.
 *
 *  NOT a measured ceiling — 03-CONTEXT's own safety guess, kept because a cap
 *  that exists is worth more than a cap that is correct. It bounds member count
 *  INDEPENDENTLY of TEAM_MAX_BYTES: 4,000 one-line members fit comfortably under
 *  256 KB, and "it was under the byte cap" is not a reason to spawn 4,000 agents. */
export const TEAM_MAX_MEMBERS = 16;

/** Byte cap for a team file, checked by the file reader before JSON.parse.
 *
 *  Its OWN constant, deliberately not a reuse of HIRE_MAX_BYTES: 16 members at
 *  the single-manifest limits do not fit in 64 KB, and silently widening the
 *  single-manifest ceiling to make team files fit would raise the cap on the
 *  hire@1 path too. Both caps are applied; see main/hire.ts. */
export const TEAM_MAX_BYTES = 256 * 1024;

/**
 * A team file: a spec tag and N hire@1 members, nothing else.
 *
 * DELIBERATELY NOT PART OF team@1 v1 (D-19): `skills`, `mcpServers` and
 * `commandFlags`. All three are legal on a SINGLE hire@1 manifest because the
 * import flow shows the operator exactly what they are about to run — the
 * command is previewed and editable, and a write/secret-tier MCP id raises
 * `consentRequired` for an explicit decision. The team-import path has no such
 * surface: no per-member command preview, no per-member consent prompt. So a
 * team member that carries any of the three comes back from
 * `validateTeamManifest` WITHOUT it rather than riding into a bulk spawn the
 * operator never reviewed. `stripAgentForExport` never emits them either.
 */
export interface TeamManifest {
  spec: typeof HIRE_TEAM_SPEC_V1;
  members: HireManifest[];
}

/** One `validateHireManifest` result, tagged with the member's position so a
 *  review sheet can say WHICH row failed and why. */
export interface TeamMemberValidation {
  index: number;
  ok: boolean;
  manifest?: HireManifest;
  errors: string[];
}

export interface TeamValidation {
  /** Whether the DOCUMENT is structurally valid. A member failing its own
   *  validation does NOT make this false — that member simply does not appear in
   *  `team.members`, and its errors are in `members[i]`. An empty team is valid. */
  ok: boolean;
  /** Present when `ok`; carries only the members that validated. */
  team?: TeamManifest;
  /** One entry per input member, in input order. Empty when `ok` is false. */
  members: TeamMemberValidation[];
  /** Document-level errors only (spec tag, members shape, member cap). */
  errors: string[];
}

/** Fields a team member may not carry — see TeamManifest's doc comment. */
const TEAM_MEMBER_OMITTED = ['commandFlags', 'skills', 'mcpServers'] as const;

/**
 * Validate an untrusted parsed JSON value as a team@1 document.
 *
 * EVERY member is delegated back through the UNMODIFIED `validateHireManifest`.
 * There is no per-member flag allowlist, length cap or model pattern in here, and
 * there must never be one: a second implementation is a second thing to keep in
 * sync, and the one that drifts is always the one nobody is looking at. Pure; no I/O.
 */
export function validateTeamManifest(raw: unknown): TeamValidation {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, members: [], errors: ['team file must be a JSON object'] };
  }
  const o = raw as Record<string, unknown>;

  if (o.spec !== HIRE_TEAM_SPEC_V1) {
    return {
      ok: false, members: [],
      errors: [`unsupported spec "${String(o.spec)}" (expected "${HIRE_TEAM_SPEC_V1}")`]
    };
  }

  if (!Array.isArray(o.members)) {
    return { ok: false, members: [], errors: ['"members" must be an array'] };
  }
  // Before mapping ANY member: an over-cap document is rejected outright rather
  // than handed back partially validated.
  if (o.members.length > TEAM_MAX_MEMBERS) {
    return {
      ok: false, members: [],
      errors: [`"members" exceeds ${TEAM_MAX_MEMBERS} — a team file may carry at most ${TEAM_MAX_MEMBERS} members`]
    };
  }

  const members: TeamMemberValidation[] = o.members.map((entry, index) => {
    const v = validateHireManifest(entry);
    if (!v.ok || !v.manifest) return { index, ok: false, errors: v.errors };
    // delete commandFlags, skills and mcpServers from the validator's OWN output
    // object — never a second parse. `delete` rather than "leave it unread":
    // validateHireManifest names every optional field in its returned literal, so
    // an unread key is still a PRESENT key that JSON.stringify would write into
    // the file and a caller could read straight back out.
    for (const field of TEAM_MEMBER_OMITTED) delete v.manifest[field];
    return { index, ok: true, manifest: v.manifest, errors: [] };
  });

  return {
    ok: true,
    team: {
      spec: HIRE_TEAM_SPEC_V1,
      members: members.flatMap((m) => (m.manifest ? [m.manifest] : []))
    },
    members,
    errors: []
  };
}

/** Parse a `hellomarkx://hire?src=<https-url>` deep link. Returns the https
 *  manifest URL, or null if the link is not a well-formed hire link. */
export function parseHireDeepLink(link: string): string | null {
  let u: URL;
  try { u = new URL(link); } catch { return null; }
  if (u.protocol !== 'hellomarkx:') return null;
  // Both hellomarkx://hire?src= (host) and hellomarkx:hire?src= (path).
  const action = (u.host || u.pathname.replace(/^\/+/, '')).toLowerCase();
  if (action !== 'hire') return null;
  const src = u.searchParams.get('src');
  if (!src) return null;
  let s: URL;
  try { s = new URL(src); } catch { return null; }
  if (!isAllowedManifestUrl(s)) return null;
  return s.toString();
}

/** https everywhere; plain http is allowed ONLY for loopback (local gallery
 *  development) — a remote page can never point the app at an http manifest. */
export function isAllowedManifestUrl(u: URL): boolean {
  if (u.protocol === 'https:') return true;
  if (u.protocol !== 'http:') return false;
  return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
}

/** Byte cap shared by the deep-link fetcher and the file importer. */
export const HIRE_MAX_BYTES = MAX_BYTES;
