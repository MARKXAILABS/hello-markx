/**
 * hiveProvisioning — the hive's per-provider bootstrap installers.
 *
 * Lifted out of src/main/hive.ts (STRUCT-02): the six per-provider hook/
 * plugin/config installers (`installAgyHooks`, `installCodexHooks`,
 * `installPiHooks`, `installOpenCodePlugin`, `installCrushConfig`,
 * `installGrokHooks`), plus the two Claude-only MCP builders (`hookSettings`,
 * `buildDefaultMcpServers`) they share no code with but were declared next
 * to. Free functions taking their inputs explicitly, so DAEMON-04 and
 * PARITY-01a stop editing the god file — every function keeps its exact
 * pre-split name so a later plan grepping for it still finds it.
 *
 * Deliberately free of any `electron` import so `node --test` can load it
 * directly. HiveManager (hive.ts) calls these at its four bootstrap-seam
 * call sites, passing `this.nodeRun`/`this.nodeRunUnquoted` bound to itself
 * — the only pieces of hive state these installers ever needed.
 */
import {
  existsSync, mkdirSync, readFileSync, writeFileSync,
  symlinkSync, copyFileSync, rmSync
} from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { AGY_HOOK_SHIM, PI_EXTENSION, OPENCODE_PLUGIN, GROK_HOOK_SHIM } from './hiveTemplates';
import { MCP_CATALOG } from '../shared/mcpCatalog';

/** The subset of HarnessConfig's default-MCP consent map hookSettings/
 *  buildDefaultMcpServers consume. Mirrors hive.ts's own local shape (kept
 *  local there too) so this module never imports the foundation-owned
 *  config type. */
type McpDefaultsMap = { [id: string]: { enabled: boolean } } | undefined;

/**
 * The standing `permissions.deny` list written into every hive-authored
 * per-agent settings.json.
 *
 * WHY IT EXISTS. `autoMode` defaults to true, and it appends
 * `--permission-mode bypassPermissions` (and `--yolo` / `--dangerously-*` on the
 * other engines). So the tool-permission PROMPT that HIVE.md §2.3 and
 * PROTOCOL.md both describe as the human-in-the-loop gate never fires — the gate
 * was prose. A `deny` rule is still enforced UNDER bypassPermissions, which makes
 * it the only gate on that path that actually holds, and it costs one array.
 *
 * CALIBRATION. Deny only what is UNRECOVERABLE or leaks a credential. Anything
 * an agent can undo — an ordinary commit, an ordinary push, deleting one file —
 * stays allowed, because a floor of agents that cannot work is not a security
 * control, it is an outage. Everything listed below either destroys committed or
 * uncommitted work with no reflog to recover it, escalates privilege, or reads a
 * secret the agent has no business holding. Deliberately NOT here: `curl`/`wget`
 * (the `curl | sh` shape cannot be matched by a prefix rule without denying all
 * network fetches, which is most of an agent's day), and `git commit`/`git push`
 * without `--force` (undoable, and integration is the god's actual job).
 *
 * HONEST LIMITS, so nobody mistakes this for a sandbox. (1) `Bash(…)` rules are
 * PREFIX matches on the command string: a model that wants past them writes a
 * shell script, or varies the spacing. This stops the confident accident — the
 * failure that actually happens — not a hostile model. (2) The `Read`/`Edit`
 * rules bind the file tools, not `cat`; they keep the default path to a secret
 * closed. (3) Claude Code only — the hookless engines take no settings file, so
 * their `--yolo` really is ungated. The real gate for all three is autoMode off
 * plus `control.toolDecision`.
 */
const AGENT_DENY_RULES = [
  // Destructive git. `push --force` (which prefix-matches --force-with-lease
  // too), `reset --hard` and `clean -f…` each throw away work that no reflog
  // brings back — someone else's history, the index, the untracked tree.
  'Bash(git push --force:*)',
  'Bash(git push -f:*)',
  'Bash(git reset --hard:*)',
  'Bash(git clean -f:*)',
  'Bash(git clean -d:*)',
  'Bash(git clean -x:*)',
  // Recursive force-delete. `rm -r` without `-f` is still allowed, so cleaning a
  // build dir is one flag away — the deny is on the shape that eats a home
  // directory when a path variable came back empty.
  'Bash(rm -rf:*)',
  'Bash(rm -fr:*)',
  'Bash(rm -r -f:*)',
  'Bash(rm -f -r:*)',
  // Windows equivalents — the floor runs there too.
  'Bash(rd /s:*)',
  'Bash(rmdir /s:*)',
  'Bash(Remove-Item -Recurse -Force:*)',
  // Privilege escalation: whatever follows runs outside every other limit here.
  'Bash(sudo:*)',
  'Bash(doas:*)',
  'Bash(runas:*)',
  // Credentials and keys — read AND write, so an agent can neither exfiltrate a
  // secret through its context nor quietly rewrite the machine's auth.
  'Read(~/.ssh/**)', 'Edit(~/.ssh/**)',
  'Read(~/.aws/**)', 'Edit(~/.aws/**)',
  'Read(~/.config/gcloud/**)',
  'Read(~/.config/gh/**)', 'Edit(~/.config/gh/**)',
  'Read(~/.docker/config.json)',
  'Read(~/.npmrc)', 'Edit(~/.npmrc)',
  'Read(~/.netrc)', 'Edit(~/.netrc)',
  'Read(~/.claude/.credentials.json)',
  'Read(**/*.pem)', 'Read(**/*.p12)', 'Read(**/id_rsa*)', 'Read(**/id_ed25519*)',
  'Read(./.env)', 'Read(./.env.*)'
];

/** A hook command string builder, bound to HiveManager so it can resolve the
 *  bundled-node launcher (`this.nodeLauncher()` → `this.root()`) — the one
 *  piece of hive state these installers need and the reason this is passed
 *  in rather than imported. */
type NodeRunFn = (script: string, ...args: string[]) => string;

/** Install the Antigravity (`agy`) lifecycle-hook bridge: write the normalizer
 *  shim and merge a `hellomarkx-hive` hook group into agy's global hooks.json so a
 *  Gemini worker reports PreToolUse/PostToolUse/Stop/PreInvocation/PostInvocation
 *  to this HookServer (live status + guarded idle delivery), reusing the Claude pipeline.
 *
 *  Two agy-isms handled: (1) antigravity-cli#49 — agy LOADS hooks from
 *  `~/.gemini/antigravity-cli/hooks.json` but TRIGGERS from `~/.gemini/config/
 *  hooks.json`, so we write BOTH; (2) commands go to cmd.exe and agy mangles
 *  embedded quotes, so the shim path must be space-free (hive roots are).
 *  Runtime-scoped by AGENT_ID (the shim no-ops for non-hive agy sessions), so
 *  this global config never disturbs the user's own `agy` usage. Best-effort,
 *  idempotent (only our own group is overwritten). */
export function installAgyHooks(root: string | null, nodeRunUnquoted: NodeRunFn): void {
  if (!root) return;
  const shim = join(root, 'bin', 'agy-hook.cjs');
  mkdirSync(join(root, 'bin'), { recursive: true });
  writeFileSync(shim, AGY_HOOK_SHIM, 'utf8');
  // Bundled node, not bare `node` — agy's hooks run with a stripped PATH too.
  const tool = (event: string) => ({
    matcher: '*',
    hooks: [{ type: 'command', command: nodeRunUnquoted(shim, event), timeout: 0 }]
  });
  const plain = (event: string) => ({
    hooks: [{ type: 'command', command: nodeRunUnquoted(shim, event), timeout: 0 }]
  });
  const group = {
    PreToolUse: [tool('PreToolUse')],
    PostToolUse: [tool('PostToolUse')],
    PreInvocation: [plain('PreInvocation')],
    PostInvocation: [plain('PostInvocation')],
    Stop: [plain('Stop')]
  };
  const gem = join(homedir(), '.gemini');
  for (const p of [join(gem, 'config', 'hooks.json'), join(gem, 'antigravity-cli', 'hooks.json')]) {
    try {
      mkdirSync(dirname(p), { recursive: true });
      let existing: Record<string, unknown> = {};
      if (existsSync(p)) {
        try { existing = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>; } catch { existing = {}; }
      }
      // Drop the pre-rename group so an upgraded machine never fires both.
      delete existing['munder-hive'];
      existing['hellomarkx-hive'] = group;
      writeFileSync(p, JSON.stringify(existing, null, 2), 'utf8');
    } catch { /* best-effort per file */ }
  }
}

/** Codex lifecycle-hook bridge → full hive parity for a `codex` worker (live
 *  status + Stop→inbox-drain), the codex counterpart of installAgyHooks().
 *
 *  Codex's hook contract is already Claude-shaped: snake_case stdin
 *  (hook_event_name/tool_name/tool_input/session_id/cwd) and a matching response
 *  contract, where `Stop` honoring {decision:'block',reason} means "continue,
 *  using reason as the next prompt" — exactly what drainForStop() returns. So we
 *  reuse the Claude `cth-hook` shim VERBATIM (no translator, unlike agy) and let
 *  HookServer handle everything unchanged.
 *
 *  ISOLATION: rather than mutate the user's global ~/.codex (which also holds
 *  their login), we point this worker at a PER-AGENT CODEX_HOME (`<dir>/.codex`,
 *  alongside Claude's settings.json) holding our own config.toml with `[hooks]`
 *  tables — so the hooks fire ONLY for hive workers and a personal `codex` run is
 *  untouched. The user's ~/.codex/auth.json is linked in and their config.toml is
 *  copied + extended (login + model/provider/trust settings still apply).
 *  Returns the CODEX_HOME path for the caller to put in the worker's env. */
export function installCodexHooks(dir: string, shimPath: string | null, nodeRunUnquoted: NodeRunFn): string {
  const home = join(dir, '.codex');
  try {
    mkdirSync(home, { recursive: true });
    const userHome = join(homedir(), '.codex');
    // Symlink the user's login so the isolated home authenticates as them.
    // (config.toml is NOT symlinked — we write our own below, seeded from theirs,
    // because it must carry our [hooks] tables.) Fall back to copy where symlinks
    // need privilege (Windows). Idempotent — skip if already linked.
    const authSrc = join(userHome, 'auth.json');
    const authDest = join(home, 'auth.json');
    if (existsSync(authSrc) && !existsSync(authDest)) {
      try { symlinkSync(authSrc, authDest); }
      catch { try { copyFileSync(authSrc, authDest); } catch { /* best-effort */ } }
    }
    // The managed app-server daemon used by Codex Remote Control is launched
    // from the standalone install rooted at $CODEX_HOME/packages. Share the
    // user's installed binaries without duplicating them into every agent.
    const packagesSrc = join(userHome, 'packages');
    const packagesDest = join(home, 'packages');
    if (existsSync(packagesSrc) && !existsSync(packagesDest)) {
      try {
        symlinkSync(packagesSrc, packagesDest, process.platform === 'win32' ? 'junction' : 'dir');
      } catch { /* remote integration falls back to a local TUI if unavailable */ }
    }
    // Wire lifecycle hooks via config.toml `[hooks]` tables — the user-layer
    // discovery surface Codex actually scans. (A bare $CODEX_HOME/hooks.json is
    // plugin-scoped — referenced FROM a plugin manifest — and is NOT discovered
    // for a plain config dir; verified empirically that it never fires.) We seed
    // this config.toml from the user's (their model/provider/trust settings carry
    // over) and append a `[[hooks.<Event>]]` group per event, each pointing at the
    // SAME cth-hook shim — reused verbatim (Codex's hook payload + response are
    // already Claude-shaped, so HookServer/drainForStop run unchanged). Regenerated
    // each spawn (idempotent). A single-quoted TOML literal avoids path escaping
    // (hive roots are space/quote-free). NOTE: hooks fire in INTERACTIVE codex
    // sessions (how hive workers run), not in headless `codex exec`.
    //
    // `timeout` IS SECONDS HERE — do NOT copy Claude's `timeout: 0` sentinel into
    // this file. Codex parses the key as `timeout_sec` and normalizes it with
    // `timeout_sec.unwrap_or(600).max(1)`, so 0 does not mean "no timeout": it is
    // floored to ONE SECOND, the shortest budget there is. That shipped through
    // v0.3.7 and made every codex worker log `SessionStart hook (failed) — hook
    // timed out after 1s` (same for UserPromptSubmit), because each hook cold-starts
    // the Electron binary via hive-node and then waits on hooks.sock — measured
    // 0.08-0.16s idle but 0.6-0.7s under 8 concurrent spawns, which is exactly what
    // session start and prompt dispatch look like. 30s clears that by two orders of
    // magnitude while still capping a wedged shim well before its own 5s internal
    // cap stops mattering; bare omission (600s) would leave a hang looking like a
    // freeze. Verify any change with codex's own resolver, no model spend:
    // `codex app-server` → initialize → `hooks/list` reports the normalized
    // timeoutSec per event.
    const shim = shimPath;
    let config = existsSync(join(userHome, 'config.toml'))
      ? readFileSync(join(userHome, 'config.toml'), 'utf8') : '';
    if (shim) {
      const events = ['PreToolUse', 'PostToolUse', 'Stop', 'SubagentStop',
        'SessionStart', 'UserPromptSubmit', 'PreCompact', 'PostCompact'];
      config += '\n# --- hellomarkx-hive lifecycle hooks (auto-generated; do not edit) ---\n';
      for (const ev of events) {
        config += `\n[[hooks.${ev}]]\n[[hooks.${ev}.hooks]]\ntype = "command"\ncommand = '${nodeRunUnquoted(shim)}'\ntimeout = 30\n`;
      }
    }
    writeFileSync(join(home, 'config.toml'), config, 'utf8');
  } catch (e) { console.error('[hive] installCodexHooks failed:', e); }
  return home;
}

/** Pi (earendil-works) bridge. Pi has a rich `pi.on(event, …)` lifecycle but no
 *  Claude-shaped hook file; instead we drop a bundled EXTENSION into a PER-AGENT
 *  PI_CODING_AGENT_DIR (so the user's global ~/.pi is never mutated) that, when Pi
 *  loads it, posts cth-hook-shaped payloads to HIVE_SOCK on tool_call/agent_end and
 *  auto-approves tool calls when the floor is in auto mode (HIVE_AUTO_APPROVE).
 *  Emitting an `agent_end`→`Stop` keeps the harness status in step (→ idle), which
 *  lets the renderer idle inbox-wake nudge deliver mail. Returns the per-agent dir
 *  for PI_CODING_AGENT_DIR.
 *
 *  LIVE-UNVERIFIED: Pi's exact extension-discovery path + event API need BYOK keys
 *  to confirm; this is written best-effort and wrapped so a wrong guess can never
 *  break the spawn. The renderer nudge is the guaranteed drain regardless. */
export function installPiHooks(dir: string): string {
  const home = join(dir, '.pi-agent');
  try {
    // Pi discovers extensions under its agent dir; we write to the documented
    // `extensions/` location (and keep it isolated per agent).
    const extDir = join(home, 'extensions');
    mkdirSync(extDir, { recursive: true });
    writeFileSync(join(extDir, 'hive-bridge.js'), PI_EXTENSION, 'utf8');
    // A manifest so Pi auto-loads the extension on start (best-effort; harmless if
    // Pi ignores it). Kept minimal and hive-authored.
    const manifest = { name: 'hellomarkx-hive-bridge', version: '0.3.1', main: 'extensions/hive-bridge.js', auto: true };
    writeFileSync(join(home, 'extensions.json'), JSON.stringify(manifest, null, 2), 'utf8');
  } catch (e) { console.error('[hive] installPiHooks failed:', e); }
  return home;
}

/** OpenCode (anomalyco/opencode) bridge — god Decision 1 (native plugin, not proxy).
 *  OpenCode has no Claude-shaped Stop hook, but its plugin API exposes a real
 *  `session.idle` lifecycle event. We drop a bundled PLUGIN into a PER-AGENT config
 *  dir's `plugin/` folder (OpenCode auto-loads `*.js` plugins from there) that posts
 *  HIVE_SOCK payloads on tool.execute.before/after + session.idle — the same
 *  Stop→drain semantics as codex's hooks, provider-agnostic, no traffic interception.
 *  Returns the config dir for OPENCODE_CONFIG_DIR (isolates from ~/.config/opencode).
 *
 *  LIVE-UNVERIFIED: plugin auto-load + session.idle firing + the inject path need
 *  BYOK keys to confirm; written best-effort, wrapped so it can't break the spawn.
 *  The renderer idle inbox-wake nudge is the guaranteed drain fallback. */
export function installOpenCodePlugin(dir: string): string {
  const home = join(dir, '.opencode');
  try {
    // BOTH `plugin/` and `plugins/`. OpenCode's current docs specify `plugins/`
    // (plural); older builds — and the shape this bridge was originally written
    // against — auto-load from `plugin/` (singular). Since the whole bridge is
    // LIVE-UNVERIFIED (no BYOK keys to prove which the installed version reads),
    // guessing one of them is a coin flip whose losing side is silent: the plugin
    // simply never loads and the agent's only inbox drain becomes the renderer
    // nudge. Writing the same ~2KB file twice costs nothing, is idempotent, and
    // is correct whichever directory the installed OpenCode actually scans.
    for (const name of ['plugin', 'plugins']) {
      const pluginDir = join(home, name);
      mkdirSync(pluginDir, { recursive: true });
      writeFileSync(join(pluginDir, 'hive-bridge.js'), OPENCODE_PLUGIN, 'utf8');
    }
  } catch (e) { console.error('[hive] installOpenCodePlugin failed:', e); }
  return home;
}

/** Crush (charmbracelet/crush) proxy routing. Crush has NO base-URL env override, so
 *  the generic proxy env-rewrite is a no-op for it; instead we write a per-agent
 *  CRUSH_GLOBAL_CONFIG whose standard providers' `base_url` all point at the loopback
 *  proxy (so whatever model the worker picks, its LLM traffic routes through the
 *  sidecar → synthesized Status/Stop/cost → status goes idle → the terminal
 *  work-order + renderer nudge deliver mail). A per-agent CRUSH_GLOBAL_DATA isolates
 *  session state from the user's global ~/.config/crush. Keys ride BYOK env vars
 *  (Crush reads ANTHROPIC_API_KEY/OPENAI_API_KEY/… directly), so none are written
 *  here. `api` follows the proxy's wire shape (advisory). Returns the config + data
 *  paths for the spawn env.
 *
 *  LIVE-UNVERIFIED: the single-upstream proxy serves one provider/endpoint shape at a
 *  time — for full synthesized events pick a model whose provider matches the
 *  configured upstream (or a local OpenAI-compatible endpoint). Cross-provider mixing
 *  is humanQA; the renderer nudge still delivers mail regardless. */
export function installCrushConfig(dir: string, loopbackUrl: string, api: 'openai' | 'anthropic'): { config: string; data: string } {
  const config = join(dir, 'crush.json');
  const data = join(dir, '.crush-data');
  try {
    mkdirSync(data, { recursive: true });
    // Override base_url → loopback for ONLY the provider whose wire-shape matches
    // the proxy (`api`): the single-upstream sidecar forwards bytes unchanged, so
    // routing a different-wire/host provider (e.g. anthropic when api='openai', or
    // openrouter/groq which are openai-wire but different hosts) through it would
    // hit the wrong endpoint and the call would fail. Those are left to their real
    // upstreams (working calls, un-proxied — no synthesized events, but mail still
    // drains via the renderer nudge + the pty-quiescence idle fallback). For the
    // default god (openai-wire) and a local OpenAI-compatible endpoint this routes
    // through the proxy cleanly. Cross-provider Crush-via-proxy is on-device
    // live-verify (Dwight verify-crush MF1; the default god model is openai-wire to
    // match). Literal loopback (Dwight's b1 — no ${VAR} expansion edge cases);
    // Crush merges config so only base_url is rewritten.
    const wireProvider = api === 'anthropic' ? 'anthropic' : 'openai';
    const providers: Record<string, { base_url: string }> = { [wireProvider]: { base_url: loopbackUrl } };
    writeFileSync(config, JSON.stringify({ providers }, null, 2), 'utf8');
  } catch (e) { console.error('[hive] installCrushConfig failed:', e); }
  return { config, data };
}

/** Grok lifecycle-hook bridge → live hive status, session capture, guarded
 *  inbox delivery, and operator gates for `grok` workers.
 *
 *  Grok supports the same hook events and decision vocabulary as Claude Code,
 *  but its stdin payload uses camelCase keys. A small adapter normalizes those
 *  keys to HookServer's Claude-shaped contract. The hook is installed in the
 *  user's global Grok hook directory because global hooks are trusted and
 *  Grok sessions/resume stay in the user's normal GROK_HOME. The adapter is
 *  strictly scoped by AGENT_ID, so ordinary Grok sessions exit without doing
 *  anything. Best-effort and idempotent. */
export function installGrokHooks(root: string | null, nodeRun: NodeRunFn): void {
  if (!root) return;
  try {
    const shim = join(root, 'bin', 'grok-hook.cjs');
    mkdirSync(join(root, 'bin'), { recursive: true });
    writeFileSync(shim, GROK_HOOK_SHIM, 'utf8');
    const tool = (matcher?: string) => ({
      ...(matcher ? { matcher } : {}),
      // Let Grok apply its event-aware defaults (5s normally, 600s for Stop).
      // Grok is a HOOK bridge (not a proxy sidecar), so it is hit by the same
      // `node: command not found` 127 — bundled node here too.
      hooks: [{ type: 'command', command: nodeRun(shim) }]
    });
    const hooks = {
      PreToolUse: [tool('.*')],
      PostToolUse: [tool('.*')],
      Stop: [tool()],
      SubagentStop: [tool('.*')],
      SessionStart: [tool('.*')],
      UserPromptSubmit: [tool()],
      PreCompact: [tool('.*')],
      PostCompact: [tool('.*')]
    };
    const hookDir = join(homedir(), '.grok', 'hooks');
    mkdirSync(hookDir, { recursive: true });
    // Remove the pre-rename hook file so an upgraded machine never fires both.
    try { rmSync(join(hookDir, 'munder-hive.json'), { force: true }); } catch { /* best-effort */ }
    writeFileSync(
      join(hookDir, 'hellomarkx-hive.json'),
      JSON.stringify({ hooks }, null, 2),
      'utf8'
    );
  } catch (e) { console.error('[hive] installGrokHooks failed:', e); }
}

/** Claude Code settings that route every relevant hook through the shim, plus
 *  (W3) the default MCP bundle merged into this PER-SESSION settings file. cwd
 *  scopes the filesystem/git servers; cfg (the consent map) gates which servers
 *  are written. Claude-only — this is invoked solely on the Claude spawn path. */
export function hookSettings(shim: string, cwd: string, cfg: McpDefaultsMap, theme: 'light' | 'dark' | undefined, nodeRun: NodeRunFn): unknown {
  // Bundled node, NOT bare `node` — see nodeLauncherPath(). Claude runs each of
  // these through `sh -c` with a stripped PATH, where `node` is often absent.
  const cmd = nodeRun(shim);
  const entry = (matcher?: string) => ({
    ...(matcher ? { matcher } : {}),
    hooks: [{ type: 'command', command: cmd }]
  });
  const mcpServers = buildDefaultMcpServers(cwd, cfg);
  return {
    // The standing HITL backstop — see AGENT_DENY_RULES. `deny` is the one
    // permission surface that survives `--permission-mode bypassPermissions`,
    // which autoMode turns on by default; without it the "permission prompts
    // are the gate" contract in HIVE.md §2.3 / PROTOCOL.md is documentation
    // describing a prompt that never appears.
    permissions: { deny: AGENT_DENY_RULES },
    // Match the TUI's truecolor palette to the harness terminal theme —
    // PER SESSION, so the user's global Claude theme (their own terminals
    // outside the app) is never touched.
    ...(theme ? { theme } : {}),
    // W3 — default skills/MCP bundle. Written into the PER-SESSION settings file
    // only (never ~/.claude), so the user's own MCP servers are never clobbered;
    // Claude merges this additively. Omitted entirely when empty so a settings
    // file with no enabled servers is unchanged from before.
    ...(Object.keys(mcpServers).length ? { mcpServers } : {}),
    // The status line gets the session status JSON after every response —
    // including context_window.{total_input_tokens,context_window_size},
    // the only clean programmatic source for the session's REAL context
    // window. The shim prints a compact in-terminal gauge and forwards the
    // payload to the harness (agent-card context gauge, exact limit).
    statusLine: { type: 'command', command: `${cmd} --status`, padding: 0 },
    hooks: {
      Stop: [entry()],
      SubagentStop: [entry()],
      PreToolUse: [entry('*')],
      PostToolUse: [entry('*')],
      UserPromptSubmit: [entry()],
      Notification: [entry()],
      SessionStart: [entry()],
      // #5C: surface mid-`/compact` so an agent boxing up its context reads as
      // 'compacting' on the floor instead of looking frozen.
      PreCompact: [entry()],
      PostCompact: [entry()]
    }
  };
}

/**
 * W3 — build the per-agent `mcpServers` map from the default catalog. Includes a
 * server only when it's enabled (catalog ∩ consent), scopes filesystem/git to the
 * agent cwd (never whole-disk), and namespaces every id `hellomarkx-<id>` so a server
 * of the same name in the user's own ~/.claude is never clobbered. A write/secret
 * server is included ONLY on an explicit `enabled:true` consent — never via a
 * default — so a malformed/partial config can't silently arm a keyed server.
 */
export function buildDefaultMcpServers(
  cwd: string,
  cfg: McpDefaultsMap
): Record<string, { command: string; args: string[]; env?: Record<string, string> }> {
  const out: Record<string, { command: string; args: string[]; env?: Record<string, string> }> = {};
  for (const e of MCP_CATALOG) {
    const consented = cfg?.[e.id]?.enabled;
    const enabled = consented ?? e.defaultEnabled;
    if (!enabled) continue;
    // Defense-in-depth: a write/secret server requires an EXPLICIT opt-in; it can
    // never ride in on a default (the catalog already ships these OFF, but this
    // guards a hand-edited/partial mcpDefaults map too).
    if (e.tier !== 'safe-readonly' && consented !== true) continue;
    // Replace the `<cwd>` placeholder (filesystem/git) with the agent cwd at merge
    // time so these stay strictly workspace-scoped.
    const args = e.spec.args.map((a) => (a === '<cwd>' ? cwd : a));
    out[`hellomarkx-${e.id}`] = {
      command: e.spec.command,
      args,
      ...(e.spec.env ? { env: e.spec.env } : {})
    };
  }
  return out;
}
