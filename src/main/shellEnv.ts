import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// ─── GATE-02: what an agent's shell is allowed to inherit ────────────────────

/**
 * Environment variable names an agent child may inherit from the operator's own
 * `process.env`, stored UPPER-CASED because the comparison upper-cases both sides.
 *
 * ALLOWLIST, NOT DENYLIST, and the reasoning is already in this codebase. The
 * operator's credentials arrive under names this project does not choose —
 * `AWS_*`, `GH_TOKEN`, `GOOGLE_*`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
 * `NPM_TOKEN`, anything ending `_SECRET`, and whatever the next tool invents.
 * Enumerating an input space someone else chooses is the exact reasoning
 * `hooks.ts` already rejects for path spellings (see `protectedPathDenial`).
 *
 * Membership is "infrastructure a shell needs to work", never "a value that
 * authenticates anything". The four network names at the end are the one place
 * that line is close: they are network CONFIGURATION, and without them a
 * corporate-proxy operator loses every outbound fetch from every agent — and
 * from MemPalace, which filters with an empty pass-through list and would fail
 * its first-run model download SILENTLY. Ceiling item (i) owns the residual.
 */
export const ENV_ALLOW: ReadonlySet<string> = new Set([
  // The shell itself
  'PATH', 'TERM', 'SHELL', 'COMSPEC', 'PATHEXT', 'OS',
  // Who and where the operator is
  'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'USERNAME', 'USER', 'LOGNAME',
  // Scratch space — every CLI writes temp files
  'TMP', 'TEMP', 'TMPDIR',
  // Windows system layout
  'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA',
  'PROGRAMFILES', 'PROGRAMFILES(X86)', 'COMMONPROGRAMFILES', 'ALLUSERSPROFILE', 'PUBLIC',
  // Machine shape — build tools read these to pick a job count
  'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE',
  // Locale + clock
  'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ',
  // Network egress configuration (see the note above and ceiling item (i))
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'NODE_EXTRA_CA_CERTS'
]);

/** Whole families, upper-cased prefixes. `LC_*` is the locale set (`LC_TIME`,
 *  `LC_NUMERIC`, …); `HIVE_*` is belt-and-braces for our own names, which
 *  normally arrive through `opts.env` AFTER the base spread — so the prefix is
 *  redundancy, never the mechanism that delivers them. */
export const ENV_ALLOW_PREFIX: readonly string[] = ['LC_', 'HIVE_'];

/**
 * Filter an environment down to what an agent child may inherit.
 *
 * THE CEILING, so this reads as a control and not as a guarantee. WHAT IT IS:
 * a bound on the INITIAL environment of every process this app spawns, applied
 * at the three `...process.env` spreads in `src/main/` — `pty.ts` (the roster
 * PTY), `hiddenClaude.ts` (the `bypassPermissions` reflection session) and
 * `memory.ts` (the MemPalace CLI). WHAT IT DOES NOT REACH:
 *
 *   (a) an agent that obtains a secret by ANY route other than inheritance — it
 *       `export`s one it read from a file, runs `aws configure`, or simply reads
 *       `~/.aws/credentials`, `~/.codex/auth.json` or `~/.netrc` directly. An env
 *       filter bounds inheritance and nothing else, by definition;
 *   (b) anything reachable on `PATH`. `PATH` survives by necessity — without it
 *       every agent dies with ENOENT — so every credential helper, keychain
 *       client and cloud CLI installed on this machine is still one command away;
 *   (c) the operator's additive pass-through list (`envPassThrough`): by
 *       construction it re-admits exactly the names they name, so it is a hole
 *       they opened knowingly. Disposition ACCEPTED, owner: the operator;
 *   (d) grandchildren. A filtered agent is free to `export` anything into the
 *       processes IT spawns; this bounds the first hop only;
 *   (e) win32 env names are case-insensitive to the OS while `Set.has` is not, so
 *       a machine reporting `Path` would lose `PATH` and kill every agent with
 *       ENOENT (L-13). Mitigated here by upper-casing BOTH sides and emitting the
 *       ORIGINAL spelling — the item stays listed because it is the failure a
 *       future edit would silently reintroduce;
 *   (f) BYOK engines that read a key the operator exported in their OWN shell
 *       stop authenticating unless that name is on the pass-through list.
 *       `hiveProvisioning.ts` states the dependency: "Keys ride BYOK env vars
 *       (Crush reads ANTHROPIC_API_KEY/OPENAI_API_KEY/… directly), so none are
 *       written here." Keys configured IN THE APP are unaffected — they are
 *       injected into `opts.env`, which layers AFTER this filter;
 *   (g) the pass-through list itself lives in `userData/config.json`, which is
 *       OUTSIDE the hive root and therefore outside everything
 *       `protectedPathDenial` protects — `rootTailVerdict` compares a child of
 *       the hive root against four literals (`bin`, `.git`, the socket name,
 *       `agents`) and this file is not under that root at all. Meanwhile
 *       `ENV_ALLOW` keeps `APPDATA`, `LOCALAPPDATA` and `USERPROFILE` because
 *       agents genuinely need them, so an agent can LOCATE AND REWRITE ITS OWN
 *       ENV ALLOWLIST and add a name that re-admits a secret. Disposition
 *       ACCEPT, owner: the hive maintainer. Inherited — every security-relevant
 *       key this app has ever had lives in that file — and closing it needs a
 *       protected config location, which is its own change;
 *   (h) `memory.ts`'s `childEnv()` AND `hiddenClaude.ts`'s spawn both filter with
 *       an EMPTY pass-through list: two of the three sites cannot reach the
 *       operator's list. Only `pty.ts` reaches it, through `SpawnOptions`.
 *       Disposition ACCEPT for this phase, owner: the hive maintainer.
 *       `hiddenClaude.ts` declares `opts.envPassThrough` and nothing populates it,
 *       because `runHiddenClaude`'s only caller is `reflect.ts` and closing it by
 *       importing `./config` was TRIED AND REVERTED: `config.ts` pulls `./db`,
 *       `db.ts` pulls `better-sqlite3`, and `test/memory-hygiene.test.cjs` loads
 *       `reflect.ts` BEFORE it injects its sqlite fake, so the real driver wins
 *       the cache and three tests fail. So ceiling item (f)'s BYOK hazard is LIVE
 *       FOR REFLECTION: an operator whose `ANTHROPIC_API_KEY` comes from their own
 *       shell loses memory condensation with no way to re-admit it. What would
 *       settle it: a phase owning both `reflect.ts` and `test/memory-hygiene.test.cjs`
 *       threads `readConfig().envPassThrough` at the call site and hoists the fake
 *       above the `loadTs` calls. `memory.ts` is the same shape for a different
 *       reason — its config arrives through constructor thunks assembled in
 *       `floor/boot.ts`, and importing `./config` would give the one deliberately
 *       electron-free spawn site an electron dependency. `mempalace` runs
 *       heuristics-only (`--no-llm`), reads no BYOK key, and everything it needs is
 *       on `ENV_ALLOW`; if a future MemPalace release grows an API-key path, THIS
 *       item is where the fix starts;
 *   (i) `HTTP_PROXY` / `HTTPS_PROXY` may embed credentials
 *       (`http://user:pass@proxy:8080`) and they are on `ENV_ALLOW`, so that string
 *       reaches every agent child. It is the operator's own shell environment
 *       reaching the operator's own agents — the same trade `PATH` and `APPDATA`
 *       already make — and the alternative is a corporate operator whose floor
 *       silently cannot fetch anything. Disposition ACCEPT, owner: the operator,
 *       who can unset the variable or move the credential to a proxy auth file;
 *   (j) TWO further `...process.env` spawns exist in `src/main/` and are NOT
 *       filtered by this control: `hive.ts`'s `startProxyBridge` (our own
 *       first-party `.cjs` sidecar, spawned under `process.execPath`) and
 *       `index.ts`'s `enableCodexRemoteForSpawn` (the `codex app-server daemon`).
 *       Neither is in GATE-02's owned line ranges, so filtering them is a
 *       separate change; the codex daemon in particular is a live-auth path that
 *       this phase cannot smoke-test. Disposition ACCEPT for this phase, owner:
 *       the hive maintainer. What would settle it: a plan owning `hive.ts`'s
 *       sidecar block and `index.ts`'s codex-remote block applies the same
 *       one-line filter and re-runs the codex remote smoke.
 *
 * @param env  the environment to filter (always `process.env` in production).
 * @param extraPassThrough  the operator's additive list. In production this is
 *   `envPassThrough` from `userData/config.json`, handed down on `SpawnOptions`
 *   rather than imported — `pty.ts` never reads config directly. Malformed input
 *   (not an array, non-string members) degrades to none, per T-04-ENV-04: an
 *   operator with a typo'd config file gets a working floor, not a crash.
 */
export function allowFromEnv(
  env: NodeJS.ProcessEnv,
  extraPassThrough: readonly string[] = []
): Record<string, string> {
  // The operator's own list, persisted as `envPassThrough` in userData/config.json
  // and handed down on SpawnOptions. Ceiling item (g): that file sits outside the
  // hive root, so an agent that can write it can widen the list that bounds it.
  const extra = new Set(
    (Array.isArray(extraPassThrough) ? extraPassThrough : [])
      .filter((n): n is string => typeof n === 'string' && n.length > 0)
      .map((n) => n.toUpperCase())
  );
  const out: Record<string, string> = {};
  for (const key of Object.keys(env)) {
    const value = env[key];
    // Node models an unset variable as `undefined`; emitting it would hand the
    // child the literal string "undefined".
    if (typeof value !== 'string') continue;
    const upper = key.toUpperCase();
    if (ENV_ALLOW.has(upper) || extra.has(upper) || ENV_ALLOW_PREFIX.some((p) => upper.startsWith(p))) {
      // ORIGINAL spelling, never the normalised one: the child is handed exactly
      // what the OS gave us (L-13).
      out[key] = value;
    }
  }
  return out;
}

// These helpers mirror the resolution logic in pty.ts. They exist separately so
// headless child processes can launch `claude` with the same PATH the user's
// interactive shell sees — Electron on macOS starts without the login-shell PATH,
// so a bare `claude` would otherwise fail
// with ENOENT in a packaged build.

let cachedPath: string | null = null;

/** script → captured output, memoised for the process lifetime. Every capture
 *  boots a full interactive login shell (rc files and all) — hundreds of ms of
 *  BLOCKING spawnSync on the main process — and shell PATH / binary locations
 *  don't change mid-session. Only successful captures are cached, so a null
 *  (shell failed / fence missing) stays retryable. */
const shellCapture = new Map<string, string>();

/** Run `script` in the user's INTERACTIVE login shell and return only what the
 *  script itself printed.
 *
 *  An interactive shell is required to pick up nvm/asdf/brew PATH edits, but it
 *  also runs the user's rc files, which are free to print. Some zsh setups emit
 *  `Restored session: <date>` from a session-save plugin BEFORE the script's
 *  own output, which silently poisons every value read back: a plain `.trim()`
 *  on `echo "$PATH"` yields `"Restored session: …\n/opt/homebrew/bin:…"` and
 *  that whole string gets handed to every agent as its PATH. Fencing the output
 *  between two markers makes rc-file chatter (before, after, or both)
 *  impossible to mistake for a result. Returns null when the shell fails or the
 *  fence never appears. */
export function captureFromLoginShell(script: string): string | null {
  const cached = shellCapture.get(script);
  if (cached !== undefined) return cached;
  const value = captureFromLoginShellUncached(script);
  if (value !== null) shellCapture.set(script, value);
  return value;
}

function captureFromLoginShellUncached(script: string): string | null {
  const mark = '__MD_SHELL_FENCE__';
  try {
    const res = spawnSync(
      process.env.SHELL ?? '/bin/zsh',
      ['-ilc', `printf %s ${mark}; ${script}; printf %s ${mark}`],
      { encoding: 'utf8', timeout: 3000 }
    );
    const out = res.stdout ?? '';
    const start = out.indexOf(mark);
    const end = out.lastIndexOf(mark);
    if (start < 0 || end <= start) return null;
    return out.slice(start + mark.length, end);
  } catch {
    return null;
  }
}

/** The user's interactive-shell PATH, queried once and cached for the session. */
export function userShellPath(): string {
  if (cachedPath !== null) return cachedPath;
  // Windows has no interactive login-shell PATH problem — use the process PATH directly.
  if (process.platform === 'win32') {
    cachedPath = process.env.PATH || '';
    return cachedPath;
  }
  const shellPath = captureFromLoginShell('printf %s "$PATH"')?.trim();
  // A PATH is a single colon-joined line. Anything multi-line is rc-file noise
  // that slipped the fence — fall back rather than hand the agent a corrupt
  // PATH it would carry into every subprocess it spawns.
  cachedPath = shellPath && !shellPath.includes('\n') ? shellPath : process.env.PATH || '';
  return cachedPath;
}

/** Resolve a bare command (e.g. 'claude') against the user's PATH + common
 *  install locations. Returns the input unchanged if it already looks like a path. */
export function resolveCommand(command: string): string {
  // Already an absolute/relative path (Unix `/` or Windows `\`) — pass through.
  if (command.includes('/') || command.includes('\\')) return command;
  if (process.platform === 'win32') {
    // `where` is the Windows equivalent of `which`; runs via cmd.exe (shell:true).
    try {
      const res = spawnSync('where', [command], { encoding: 'utf8', timeout: 3000, shell: true });
      const path = (res.stdout ?? '').trim().split(/\r?\n/)[0];
      if (path && existsSync(path)) return path;
    } catch { /* fall through */ }
    const appData = process.env.APPDATA ?? '';
    const localAppData = process.env.LOCALAPPDATA ?? '';
    const home = process.env.USERPROFILE ?? process.env.HOME ?? '';
    const winCandidates = [
      `${appData}\\npm\\${command}.cmd`,
      `${appData}\\npm\\${command}`,
      `${localAppData}\\Programs\\claude\\${command}.exe`,
      `${home}\\.claude\\local\\${command}.cmd`,
      `${home}\\.claude\\local\\${command}`
    ];
    for (const c of winCandidates) if (existsSync(c)) return c;
    return command;
  }
  const which = captureFromLoginShell(`which ${command}`);
  if (which) {
    const path = which.trim().split('\n').map((l) => l.trim()).filter(Boolean).pop();
    if (path && existsSync(path)) return path;
  }
  const candidates = [
    `/opt/homebrew/bin/${command}`,
    `/usr/local/bin/${command}`,
    `${process.env.HOME ?? ''}/.local/bin/${command}`,
    `${process.env.HOME ?? ''}/.claude/local/${command}`,
    `${process.env.HOME ?? ''}/.volta/bin/${command}`
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return command;
}
