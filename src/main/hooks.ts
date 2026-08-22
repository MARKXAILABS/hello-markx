/**
 * HookServer — the bridge between `claude` lifecycle hooks and the harness.
 *
 * Each spawned agent is launched with `--settings` pointing its hooks at a tiny
 * shim (see HOOK_SHIM in hive.ts) that forwards the hook payload to the Unix
 * domain socket this server listens on. We then:
 *   - drive avatar state from PreToolUse/PostToolUse/Notification/etc., and
 *   - own the Stop boundary: unread hive mail is handed back as a guarded
 *     block-to-continue (#5, `drainAtStop`), so an agent drains its inbox with no
 *     renderer attached and without anything typing into its input line.
 *
 * AUTHENTICATED, PER AGENT (GATE-01). The socket is a Unix-domain socket / named
 * pipe, so ANY local process can connect and post a payload claiming any
 * `agent_id` — enough to hijack another agent's --resume session id, poison the
 * cost ledger, or clear breaker state. So `payload.agent_id` is NOT trusted and
 * is never read: every payload must carry a `sock_token` that main minted for
 * ONE agent at ONE PTY spawn (`mintToken`, injected as HIVE_SOCK_TOKEN into that
 * PTY's env only), and this server DERIVES the identity from that token via
 * `Map<token, agentId>`. Tokens are revoked when the PTY exits. Payloads whose
 * token is unknown are dropped, LOUDLY (see `authorized`).
 *
 * THE HONEST CEILING (D-14) — exactly two properties, and no more:
 *   1. There is no floor-wide key. Reading one agent's HIVE_SOCK_TOKEN buys that
 *      agent's identity, not the floor's.
 *   2. `payload.agent_id` is no longer trusted for identity.
 * It is NOT secrecy: an agent's own shell reads whatever its own shim reads.
 * It is NOT "agent A cannot authenticate as agent B" — that sentence is false on
 * Linux. B's token lives in B's process environment (pty.ts spreads it into the
 * PTY), so a same-uid sibling reads /proc/<B-pid>/environ; AGENT_DENY_RULES
 * covers no /proc path and B's pid is one `pgrep -f` away. Any same-uid process
 * that can read another agent's environment defeats this mechanism. Claim those
 * two properties and nothing beyond them.
 *
 * REJECTED ALTERNATIVES, recorded so they are not re-litigated (D-15): a
 * permission-restricted token FILE (a no-op against a same-uid shell, and chmod
 * 0o600 is effectively meaningless on NTFS — false assurance); HMAC/nonce
 * rotation (adds freshness, not impersonation resistance, and PI_EXTENSION /
 * OPENCODE_PLUGIN are fire-and-forget so they cannot do challenge-response);
 * socket peer-credential binding (no supported Node API for the socket fd or
 * pipe handle — nodejs/node#7627 — so it means authoring and ABI-rebuilding a
 * native addon on three CI gates).
 *
 * FAIL-OPEN AT THE SHIM, deliberately, and bounded rather than removed. A shim
 * that cannot connect exits 0, and for Claude Code a PreToolUse hook that exits
 * 0 with no stdout is *allow* — so deleting the socket file disables the gate
 * for everyone. Making the shim fail CLOSED would break every agent whenever the
 * app is legitimately not running (an agent PTY outlives a quit), which is a
 * normal state. So the shim keeps exiting 0 and `armSocketWatchdog` re-listens
 * on a missing or replaced socket instead: the outage is bounded by the watchdog
 * interval rather than by the next app restart, and it is never silent. Re-taking
 * a rebound path is a race we can lose; what is guaranteed is detection + a loud
 * log, not exclusion.
 *
 * WHAT THE PreToolUse GATE DOES NOT REACH (see `protectedPathDenial`): the
 * user-global engine seeds — `~/.codex/config.toml` (copied into every codex
 * agent's config at spawn, hive.ts:2107/:2160-2162), `~/.gemini/…/hooks.json`
 * (hive.ts:2070) and `~/.grok/hooks/` (hive.ts:2302) — sit outside the hive root
 * entirely, so an agent appending one `[[hooks.PreToolUse]]` block to a seed has
 * it executed inside another agent's hook process with that agent's env. Nor does
 * it reach an engine with NO PreToolUse hook at all (pi, opencode, the qwen proxy
 * tier): for those, `ensureHive` rewriting the shim from its constant on every
 * bootstrap is a repair, not a gate.
 *
 * Runs in the Electron main process.
 */
import { createServer, type Server } from 'node:net';
import { randomBytes } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { expandTilde } from './fs';
import { Notification, type WebContents } from 'electron';
import type { HiveManager } from './hive';
import type { HarnessConfig } from './config';
import type { ControlRegistry } from './control';
import type { CircuitBreaker } from './breaker';
// FLOOR-09 (#19): the TELEMETRY AgentUsageSample, deliberately — `usage.ts`
// declares a second interface of the same name whose `sessionId`/`model` are
// nullable, and `recordCostSample` takes this stricter one. The branch below
// already satisfies it (it guards on a truthy session id and coerces the model).
import type { AgentUsageSample } from './telemetry';
import { estimateCostUsd } from './pricing';
import { SPAWN_SAFE_SESSION_ID } from './transcript';
import { isClaudeProvider } from '../shared/agentProvider';

interface HookPayload {
  hook_event_name?: string;
  /** IGNORED (GATE-01). The shims still send it and the field is kept so the
   *  wire shape is documented — but nothing in this file reads it for identity:
   *  a payload's own claim about who sent it is worth nothing on a socket any
   *  local process can reach. The agent id comes from `sock_token` instead. */
  agent_id?: string | null;
  /** The PER-AGENT token main minted for one PTY spawn (`mintToken`). This is
   *  the ONLY identity input: the server looks it up to derive `agentId`. */
  sock_token?: string;
  session_id?: string;
  transcript_path?: string;
  /** Status-line payloads only: the session's live context accounting. */
  context_window?: { total_input_tokens?: number; context_window_size?: number };
  cwd?: string;
  tool_name?: string;
  tool_input?: unknown;
  stop_hook_active?: boolean;
  prompt?: string;
  source?: string;
  notification_type?: string;
  /** Notification hook text, e.g. "Claude is waiting for your input" (idle) vs a
   *  permission request. Used to tell "needs you" from "just done / lingering". */
  message?: string;
  /** CostSample payloads only (synthesized by the proxy-bridge sidecar for
   *  qwen). Raw token counts for one response, fed to the cost ledger. */
  model?: string;
  input?: number;
  output?: number;
  cache_read?: number;
  cache_creation?: number;
}

/**
 * THE IDENTITY of a filesystem object — `(dev, ino)` — or null when there is none.
 *
 * This is the whole protected-path control, and it replaced four rounds of
 * SPELLING canonicalisation. Two paths that name the same object have the same
 * `(dev, ino)` whatever they are spelled like: an 8.3 short name, a `\\?\`
 * long-path prefix, a `\\.\` device path, `\\localhost\C$`, `\\<this machine's
 * own LAN / Tailscale / WSL address>\C$`, `\\0--1.ipv6-literal.net\C$`, a
 * `\\?\Volume{GUID}`, a `\\?\GLOBALROOT\Device\HarddiskVolumeN`, a `subst`
 * alias, a `net use` mapped drive, an ancestor junction — and a HARD LINK,
 * which no path canonicalisation can ever reach because it is a second
 * DIRECTORY ENTRY, not a second name. Every one of those was measured ALLOWED
 * against the string comparison this replaced.
 *
 * A list of names is a model of an input space the ATTACKER chooses, so it does
 * not converge: four rounds of review found seventeen bypasses, four of which
 * were addresses of this very machine. If a reviewer reports a new spelling the
 * correct response is a TEST CASE, never a rewrite rule — a new spelling that
 * reaches the same object already denies, by construction.
 *
 * `{ bigint: true }` is load-bearing, not style. Live hive paths on NTFS measure
 * `ino = 24769797950806710`, 2750x past Number.MAX_SAFE_INTEGER, so a Number
 * `ino` rounds two DISTINCT files together — a false identity, silently.
 *
 * `ino === 0n` is NOT an identity: exFAT and some network filesystems have no
 * stable file ids. Reporting "no identity" rather than "identity 0" is what
 * stops two unrelated files on such a volume comparing equal; the caller turns
 * a missing HIVE ROOT identity into a loud, total deny (see `hiveIdentities`).
 */
function pathIdentity(p: string): string | null {
  try {
    const st = statSync(p, { bigint: true });
    if (st.ino === 0n) return null;
    return `${st.dev}:${st.ino}`;
  } catch { return null; /* does not exist, or cannot be reached */ }
}

/** Case-fold for the two places a NAME is still compared — both of them inside a
 *  directory whose identity has already been established. NTFS is
 *  case-insensitive; POSIX is not. */
function fold(s: string): string {
  return process.platform === 'win32' ? s.toLowerCase() : s;
}

/**
 * Case-fold a name that is about to be compared against a PROTECTED LITERAL.
 *
 * Unlike `fold`, this folds on EVERY platform, and the difference is the
 * direction the comparison points. `fold` is used where a match GRANTS access
 * (an agent's own directory), so folding on a case-SENSITIVE filesystem would
 * hand agent `a-1` the genuinely-different directory `agents/A-1`. Here a match
 * DENIES, so the risk runs the other way.
 *
 * Measured on CI, which is why this exists: `<hive>/BIN/cth-hook.cjs` on a FRESH
 * hive was ALLOWED on ubuntu-latest AND macos-latest while denying on win32.
 * macOS is the real hole — APFS is case-INSENSITIVE by default, so `BIN` and
 * `bin` are the SAME directory and the write lands in the protected one. On
 * ext4 they are different directories, so folding there over-denies — but the
 * only paths this reaches are `<hive>/BIN`, `<hive>/.GIT`, `<hive>/AGENTS` and
 * the socket's own name at the hive root, none of which an agent has any
 * legitimate reason to create. Over-denying four names at the hive root is the
 * correct trade against a live bypass on macOS.
 */
function foldProtected(s: string): string {
  return s.toLowerCase();
}

/**
 * Normalise every path COMPONENT the way Win32 itself does, or null if a
 * component normalises to nothing.
 *
 * Win32 strips trailing dots and spaces from every path component. Node's `fs`
 * does NOT: it runs `path.resolve()` and then `toNamespacedPath()`, and the
 * `\\?\` prefix that adds **disables** exactly that normalisation. That is why
 * `statSync`, `realpathSync`, `realpathSync.native` and `existsSync` all fail on
 * `<hive>\bin.\cth-hook.cjs` while `cmd.exe` — which `pty.ts` documents as the
 * harness's Windows shell — writes straight through it into the real `bin/`.
 *
 * This is a documented OS rule applied in closed form, which is the opposite of
 * a spelling list: it is one transform, not an enumeration of what to catch.
 */
function win32Components(p: string): string | null {
  if (process.platform !== 'win32') return p;
  const parts = p.split(/[\\/]/);
  for (let i = 0; i < parts.length; i++) {
    const c = parts[i];
    if (!c || c === '.' || c === '..') continue;
    const trimmed = c.replace(/[. ]+$/, '');
    if (!trimmed) return null; // e.g. `...` — main cannot say what it names
    parts[i] = trimmed;
  }
  return parts.join('\\');
}

/**
 * A win32 target main cannot FRAME. Identity answers "WHICH object is this",
 * and these two shapes do not name an object main can see at all.
 *
 *   1. DRIVE-RELATIVE, `C:..\..\bin\cth-hook.cjs`. `path.win32.isAbsolute` is
 *      **false** for it, so it takes the `join(base, target)` branch and
 *      `path.win32.join` eats the `C:` as an ordinary segment (consuming one
 *      `..`): the gate measures one directory too deep and ALLOWS, while Windows
 *      measures from the process's PER-DRIVE current directory and writes the
 *      real file.
 *   2. ROOTED-RELATIVE, `\bin\cth-hook.cjs`. `path.win32.isAbsolute` is **true**
 *      for it, so it takes the measure-exactly-this-path branch and is framed
 *      against MAIN's cwd drive while the agent's shell frames it against the
 *      agent's — which lands in the real `bin/` whenever the hive is on that
 *      drive (a `subst` hive is the easy case).
 *
 * Neither is a spelling problem and identity does not close either: main cannot
 * see a per-drive current directory. So the shape is refused, with its own
 * reason.
 *
 * Both halves are deliberately narrow, and the narrowing was measured rather
 * than assumed. (1) additionally requires a separator, which is what keeps a
 * `sed` word like `s:foo:bar:g` out of it. (2) additionally requires a SECOND
 * separator, which is what keeps `cmd /c`, `robocopy /E` and the 22 bare `/`
 * words in this repo's own README out of it. The residual false positives —
 * `x:1/2`, `D:pkg/file.ts`, a bare regex word like `/^a$/` — are named in the
 * ceiling comment on `protectedPathDenial`.
 */
function driveRelative(target: string): boolean {
  if (process.platform !== 'win32') return false;
  if (/^[A-Za-z]:[^\\/]/.test(target) && /[\\/]/.test(target)) return true;
  return /^[\\/][^\\/]+[\\/]/.test(target);
}

/** The four protected-path reasons, hoisted so the identity walk and the
 *  un-created-tail rule cannot drift apart in what they say. Their text is
 *  unchanged from the string-comparison version: this plan changed how a
 *  candidate is MATCHED to a branch, not what any branch decides. */
const DENY_BIN = 'Denied: <hive>/bin holds the ONE hook shim every agent on this floor '
  + 'executes. Writing it runs your code inside another agent\'s hook, with that '
  + 'agent\'s environment and token.';
const DENY_GIT = 'Denied: the hive root is a git repo the app itself commits to. A hook or '
  + 'core.hooksPath under <hive>/.git executes as a child of the main process on '
  + 'the next hive commit — outside every limit that applies to you.';
const DENY_SOCK = 'Denied: deleting or replacing the hook socket takes the PreToolUse gate '
  + 'down for EVERY agent (the shims fail open), and rebinding that path harvests '
  + 'every agent\'s token.';
const denyOtherAgent = (owner: string): string =>
  `Denied: <hive>/agents/${owner} belongs to another agent. Its settings.json `
  + 'names the hook commands that agent runs, so writing it is code execution in '
  + 'their session.';

/** Main cannot FRAME the target (`driveRelative`), so it is refused rather than
 *  measured against a directory main invented. */
const DENY_FRAME = 'Denied: main cannot FRAME this target. A drive-relative path (C:..\\x) or a '
  + 'rooted-relative one (\\x) is measured from a per-drive current directory only your own '
  + 'shell can see, so main cannot say which directory it names. Spell it absolutely.';
/** A component that normalises to nothing under Win32's trailing-dot/space rule. */
const DENY_COMPONENT = 'Denied: a component of this path normalises to nothing under Win32\'s '
  + 'trailing-dot and trailing-space rule, so main cannot say which object it names.';
/** Nothing in the ancestor chain could be stat()ed. */
const DENY_UNIDENTIFIABLE = 'Denied: main cannot IDENTIFY this target — nothing in its ancestor '
  + 'chain could be stat()ed, which happens for an unmapped drive letter and for an unreachable '
  + 'network host. A path main cannot identify cannot be compared against the hive\'s protected '
  + 'set, and this gate denies what it cannot check rather than allowing it.';
/** The hive volume has no stable file ids at all. */
const DENY_NO_STABLE_ID = 'Denied: the hive\'s own volume reports no stable file ids (ino 0), so '
  + 'main cannot compare file IDENTITY on it and every protected-path answer would be a guess. '
  + 'This is loud on purpose: the alternative is a silent fall back to comparing path spellings, '
  + 'which is the comparison this gate exists to replace. Move the hive to a volume with stable '
  + 'file ids (NTFS, ext4, APFS).';

/** No ABSOLUTE base exists to measure a relative target against. Names
 *  `cwdValid` so an operator can fix the registry rather than guess: the blast
 *  radius is every relative word for that ONE agent, which is severe and
 *  deliberate — an agent whose cwd is not absolute cannot be spawned into its
 *  own directory either, so this makes an already-broken record visible. */
const DENY_CANNOT_LOCATE = 'Denied: main cannot LOCATE this relative target. Your agent record '
  + 'has no ABSOLUTE working directory (its registry cwdValid is false), so there is no directory '
  + 'to measure the path against — and a cwd supplied by the payload deliberately cannot stand in '
  + 'for one, because that would let a single JSON field turn this deny into an allow. Fix the '
  + 'agent\'s cwd, or spell the target absolutely.';

/** Could this shell word be a path at all? A word with no separator that does
 *  not start with `~`, `.` or a drive letter cannot resolve INTO a protected
 *  directory from any base, so resolving it is pure cost. */
function pathShaped(w: string): boolean {
  return w.includes('/') || w.includes('\\') || w.startsWith('~') || w.startsWith('.')
    || /^[A-Za-z]:/.test(w);
}

/** The protected identities of one hive, computed once per payload. */
interface HiveIdentities {
  root: string;
  bin: string | null;
  git: string | null;
  sock: string | null;
  sockName: string | null;
  agents: string | null;
  own: string | null;
  binPath: string;
}

/** Where a directory sits relative to the protected set. `at` is set only when
 *  the directory IS `<hive>` or `<hive>/agents`, where the caller's own leaf
 *  name is the next component and therefore decides. */
interface Containment {
  deny: string | null;
  at?: 'root' | 'agents';
}

/**
 * The distinct path-shaped candidates one payload may carry.
 *
 * `protectedPathDenial` pushes EVERY shell word, and each word now costs an
 * ancestor walk on the Electron MAIN thread. A cap on WORDS has no safe value:
 * an ordinary `cat > README.md <<'EOF'` heredoc of this repo's own README is
 * 2612 shell words, so any cap that stops a padding attack also denies ordinary
 * work with a message about hive-protected paths.
 *
 * So the cap is on DISTINCT PATH-SHAPED candidates, counted BEFORE anything is
 * resolved, and crossing it DENIES rather than truncating the scan — truncating
 * is fail-open with a free padding attack. Sizing, from the measurements in the
 * plan: the worst REAL observation is 120 (a `git add` of 120 files) and the
 * worst heredoc is 67 distinct path-shaped candidates, while the measured
 * blocking cost at 500 distinct directories is 114 ms — 4x headroom over real
 * work at one end, and 44x under the shims' own 5 s budget at the other.
 */
const HOOK_CANDIDATE_MAX = 500;

/**
 * The wall-clock budget for ONE payload's resolution work, checked BETWEEN
 * candidate resolutions.
 *
 * A cap on COUNT is not a cap on COST. The per-candidate cost is ~0.2 ms because
 * ordinary paths are local; a single path on an unreachable network host was
 * measured at 21 020-21 040 ms — for `statSync` and `realpathSync` alike.
 * Windows caches that failure, so the SECOND candidate against the same dead
 * host costs 1-3 ms, which is why a per-payload memo plus this deadline bounds a
 * payload to `budget + one resolve` instead of `N x 21 s`.
 *
 * CEILING, stated rather than implied: a deadline checked between resolutions
 * cannot interrupt ONE in-flight blocking syscall, so the true worst case is
 * `budget + one resolve`. That is exactly the worst case this file already had
 * for a single absolute `file_path` of `Z:\x`; this bound does not remove it, it
 * stops it being multiplied. 250 ms is ~2.2x the cap's own measured worst case
 * (114 ms), so the budget only ever fires when one resolve is pathological,
 * never on ordinary work. Crossing it DENIES, naming the budget.
 */
const HOOK_RESOLVE_BUDGET_MS = 250;

/** How many entries the recursive `<hive>/bin` scan will identify for the
 *  hard-link check before it gives up — and giving up DENIES. A bound that
 *  degrades to allow is not a bound. `bin/` holds the shim plus the bundled-node
 *  `runtime/` wrapper; anything approaching this number is not a hive `bin/`. */
const HOOK_BIN_SCAN_MAX = 4096;
const DENY_BIN_SCAN = `Denied: <hive>/bin holds more than ${HOOK_BIN_SCAN_MAX} entries, so main `
  + 'could not finish identifying them to check this hard link against them. This denies rather '
  + 'than gives up, because a bound that degrades to allow is not a bound.';

/**
 * THE DESIGN RULE THIS LISTENER IS BUILT AGAINST, verbatim, because three
 * consecutive attempts at bounding it shipped a fail-OPEN:
 *
 *   The shim's failure mode is ALLOW. Any mechanism that closes, destroys,
 *   refuses or starves a connection is a BYPASS, not a control. The only
 *   admissible bound is one that delivers an explicit `permissionDecision:
 *   'deny'` to a peer that is still connected to read it.
 *
 * Every shim does `c.on('error', () => process.exit(0))` and exits 0 with no
 * stdout on an empty read, and a PreToolUse hook that exits 0 with no stdout is
 * *allow*. So:
 *
 *   - a `destroy()` on a cap-cross discards the pending write, the peer sees
 *     ECONNRESET, exits 0, ALLOW. Rejected.
 *   - an idle timeout sized ABOVE the shims' own 5 s self-timeout writes its deny
 *     to a peer that already exited 0. ALLOW. Rejected.
 *   - NODE'S OWN SERVER-LEVEL CONNECTION LIMIT is enforced inside `onconnection`,
 *     in C++, BEFORE the `'connection'` event: it closes the client handle and
 *     returns, the handler never runs, and the peer reads ZERO bytes. ALLOW —
 *     bought with N idle sockets and no payload at all, strictly cheaper than the
 *     memory exhaustion it was meant to prevent. Rejected — and deliberately
 *     not spelled by its property name anywhere in this file, because the file
 *     is grepped raw for that name as the regression guard against its return.
 *   - an aggregate in-flight byte budget fails from the other side: with no
 *     eviction and no per-peer accounting, one peer that never closes denies
 *     EVERY subsequent connection on the floor — a self-sustaining outage that
 *     also turns every `Stop` on agy and grok into `{decision:'deny'}`. Rejected.
 *
 * WHAT DOES BOUND A CONNECTION, and it is enough for one: the per-line byte cap
 * and the idle timeout close the loop between them. A peer that stops sending is
 * reaped by the idle timeout, with an explicit deny; a peer that keeps sending
 * crosses HOOK_LINE_MAX and is denied. There is no third state in which a peer
 * holds buffered bytes indefinitely, so exposure is
 * `concurrent connections x HOOK_LINE_MAX` WITH FORCED TURNOVER.
 *
 * The NUMBER of concurrent connections is deliberately NOT bounded, and that is
 * an accepted residual with an owner (T-P24-12), not an oversight. A USERLAND
 * connection counter — accept, run the handler, write the deny, `conn.end()` —
 * does satisfy the admissibility rule above; the earlier blanket claim that no
 * connection bound is admissible was a generalisation from one fact about how
 * Node enforces that server-level limit, and it was wrong. It is rejected on the
 * narrower ground: it converts an attacker's socket count into a floor-wide DENY
 * for every legitimate shim — the same outage shape that got the aggregate byte
 * budget deleted — and its threshold has no calibrated value, because below the
 * floor's real concurrency it is an outage and above it the attacker simply
 * opens that many. What would actually reduce the product is to stop holding the
 * payload as one JS string (a streaming framer that counts bytes and never
 * accumulates); that is its own plan. HOOK_LINE_MAX is NOT the lever — its floor
 * is set by the largest payload this app legitimately produces.
 */
/**
 * The per-line byte cap. Sized ABOVE what this app itself permits a tool to
 * move: `src/main/fs.ts` allows a 2 MB text read (`MAX_READ_BYTES`) and a 10 MB
 * binary read (`MAX_BINARY_READ_BYTES`), and a `Write` PreToolUse carries the
 * file contents JSON-escaped — so a 1 MB cap (what `slack.ts` uses for a very
 * different surface) would stop the gate inspecting exactly the largest writes.
 * 16 MiB clears the 10 MB anchor with room for JSON escaping of the 2 MB text
 * anchor. Exported so a test drives the real constant rather than a copy of its
 * value: a test that hard-codes 16777216 stops meaning anything the day this
 * moves.
 */
export const HOOK_LINE_MAX = 16 * 1024 * 1024;

/**
 * The idle timeout, sized BELOW the shims' own 5 s self-timeout
 * (`setTimeout(() => process.exit(0), 5000)` in every shim), not above. A shim
 * that has abandoned the connection has already exited 0, and exit 0 with no
 * stdout is *allow*, so a deny written at t=10s goes to a socket nobody reads.
 * 2 s leaves a 3 s margin: enough that a loaded machine still answers a live
 * call (an ordinary decision measures in single-digit milliseconds), and far
 * enough under 5 s that the deny always lands while the peer is reading.
 */
const HOOK_IDLE_MS = 2_000;

/**
 * The reply every bound writes before it closes. Declared once so the exits
 * cannot drift apart, and deliberately the SAME shape `handle` returns for a
 * protected path.
 *
 * WHAT THIS MEANS FOR A NON-PreToolUse EVENT, because main cannot know: these
 * bounds fire BEFORE `JSON.parse`, so the `hook_event_name` is unknown at that
 * moment. A `hookEventName: 'PreToolUse'` deny returned to a `Stop`,
 * `PostToolUse` or `Notification` payload is ignored by most engines — but the
 * agy and grok shims translate `hookSpecificOutput.permissionDecision === 'deny'`
 * into `{decision:'deny'}`, so a Stop-time bound-cross becomes a Stop denial on
 * those two. That is the correct trade (refusing a turn-end is recoverable;
 * allowing an unread write is not) and it is a behaviour change, said here
 * rather than left for a reviewer to discover. The FIFTH arm is the
 * highest-frequency payload on this socket and it is the harmless one: the
 * statusLine shim does `c.end(...)` then `c.on('close', () => process.exit(0))`
 * and never reads a reply at all, so a bound-cross on a status tick is silently
 * discarded rather than mistranslated.
 */
const boundDeny = (reason: string): string => JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: reason
  }
});
const HOOK_OVERSIZE_DENY = boundDeny(
  `Denied: this hook payload crossed ${HOOK_LINE_MAX} bytes on one line without a newline, so the `
  + 'harness stopped buffering it. This is a FRAMING bound, not a protected-path decision — it '
  + 'answers deny rather than closing, because a silent close reads as `allow` at every shim.'
);
const HOOK_IDLE_DENY = boundDeny(
  `Denied: this hook connection sent no complete line within ${HOOK_IDLE_MS}ms. This is a FRAMING `
  + 'bound, not a protected-path decision — it answers deny rather than closing, because a silent '
  + 'close reads as `allow` at every shim.'
);

/** Throttle for the rejection log. A BROKEN env wiring rejects every payload —
 *  and the statusLine shim alone fires after every agent response — so an
 *  unthrottled line per rejection would bury the log it is meant to explain. */
const REJECT_LOG_INTERVAL_MS = 10_000;

/** Last time sink 4 (below, at the `recordSession` call) refused to STORE an
 *  id that is not argv-safe. Its own timestamp rather than `authorized()`'s
 *  counters: the two rejections have different causes and different fixes, and
 *  merging them would make either one's rate hide the other. */
let lastSessionRejectLog = 0;

/** How long a turn must run before its Stop is worth a desktop toast (#42).
 *  Below this the human is almost certainly still watching the terminal, and a
 *  notification per turn-end is how a floor teaches its operator to mute it. */
const LONG_TURN_MS = 2 * 60_000;

export class HookServer {
  private server: Server | null = null;
  /** agentId → the live session's transcript file, learned from hook payloads.
   *  Lets the harness read per-agent telemetry (e.g. current context size)
   *  even when several agents share one cwd. */
  private transcriptPaths = new Map<string, string>();
  /** agentId → the latest context-window accounting from the statusLine shim
   *  (current tokens + the REAL window size — 200k vs 1M, which nothing else
   *  exposes). The renderer already gets this pushed live on `hive:contextUpdate`;
   *  we also retain the last value here so a main-side read (the voice read-layer's
   *  get_agent_detail / list_agents) can report "how full is each agent's context"
   *  without depending on a renderer round-trip. */
  private contextById = new Map<string, { tokens: number; limit: number; ts: number }>();
  /** Rejected-payload accounting for the throttled log in `authorized`. */
  private rejected = 0;
  private lastRejectLog = 0;

  /**
   * GATE-01 — token → agentId. THE identity source for everything past the
   * socket. One entry per live PTY spawn: `mintToken` adds, PTY exit removes.
   * A token is meaningless on its own — it only ever names the one agent main
   * minted it for, so reading agent A's env yields A's identity and nothing
   * else. This replaced a single floor-wide secret that `pty.ts` spread into
   * every PTY, where reading ANY agent's env yielded the whole floor.
   */
  private tokens = new Map<string, string>();

  /** Socket watchdog (see `armSocketWatchdog`) — POSIX only. */
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private sockIno: number | null = null;
  /** Watchdog period. Public so a test can shorten it to ~50ms: this is a repair
   *  loop, not a hot path, and a test that sleeps 10s gets deleted by the next
   *  person who has to wait for it. */
  socketWatchdogMs = 10_000;

  /** agentId → when its current turn started (the last UserPromptSubmit, or the
   *  last Stop when nothing else marked a boundary). Drives the "long task
   *  finished" toast (#42): a Stop is only worth interrupting a human for when
   *  the human has actually been waiting. */
  private turnStartedAt = new Map<string, number>();

  constructor(
    private hive: HiveManager,
    private getWebContents: () => WebContents | null,
    private getConfig: () => HarnessConfig,
    /** #7C — operator control state. Optional so tests can omit it. */
    private control?: ControlRegistry,
    /** Circuit breaker (Lane A #6.6b) — fed the hook-derived signals (session id,
     *  repeated identical tool calls). Optional so the server still runs without it. */
    private breaker?: CircuitBreaker,
    /** #5 — the guarded inbox drain at the Stop boundary (DeliveryService).
     *  Optional so tests (and a hive-less run) get the old plain Stop. */
    private drainAtStop?: (agentId: string) => { block: boolean; reason?: string },
    /** #42 — put an agent in front of the human when they click its toast. */
    private focus?: (agentId: string) => void,
    /** FLOOR-09 (#19) — the proxy tier's cost sink. `telemetry.recordCostSample`
     *  in production (injected at index.ts's `new HookServer(...)`), omitted in
     *  tests that don't care. Optional so the server still runs without it,
     *  exactly like `breaker` and `control` above — and LAST, so no existing
     *  call site or test has to move an argument. */
    private recordCost?: (s: AgentUsageSample) => void
  ) {
    // GATE-01 — the qwen/crush PROXY SIDECAR is not a PTY, so `PtyManager`'s
    // per-spawn mint never sees it: it is a child of `HiveManager`. Register
    // this server's registry as the hive's token source here rather than adding
    // a wiring line to the composition root, because we already hold the hive
    // and this is the only object that can mint. Without it the sidecar sends
    // `sock_token: ''`, `authorized()` drops it, and every qwen/crush agent is
    // silently dead-hooked — no live status, no Stop→drain, no cost.
    this.hive.setHookTokenSource?.(
      (agentId) => this.mintToken(agentId),
      (token) => this.revokeToken(token)
    );
  }

  start(): void {
    const sock = this.hive.sockPath();
    if (!sock || this.server) return;
    // Clear a stale socket file left by a previous run.
    try { if (existsSync(sock)) rmSync(sock); } catch { /* noop */ }
    this.listenOn(sock);
  }

  /** Build the connection handler and take the path. Split out of `start()` so
   *  the watchdog can re-take a socket that went missing or was replaced. */
  private listenOn(sock: string): void {
    const server = createServer((conn) => {
      let buf = '';
      // ONE payload per connection. `conn.end()` half-closes only the WRITABLE
      // side, so a peer with `allowHalfOpen: true` keeps its readable side open
      // and — with `buf` never sliced — one more byte re-satisfies
      // `indexOf('\n')` and the same payload is handled a second time. No
      // shipped shim can trigger that today (all six emit exactly one payload
      // per connection), so it is LATENT: the `done` flag fixes the over-count
      // and the slice fixes the silent drop of a batched second payload.
      let done = false;
      const answer = (body: string): void => {
        done = true;
        try { conn.end(body); } catch { /* the peer is already gone */ }
      };
      // Every abnormal exit answers explicitly, and closes with `end`, never
      // `destroy` — see the design rule above HOOK_LINE_MAX.
      conn.setTimeout(HOOK_IDLE_MS);
      conn.on('timeout', () => { if (!done) answer(HOOK_IDLE_DENY); });
      conn.on('data', (d) => {
        if (done) return;
        buf += d.toString();
        const nl = buf.indexOf('\n');
        if (nl === -1) {
          if (buf.length > HOOK_LINE_MAX) answer(HOOK_OVERSIZE_DENY);
          return; // wait for the full line
        }
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        done = true;
        if (line.length > HOOK_LINE_MAX) { answer(HOOK_OVERSIZE_DENY); return; }
        let payload: HookPayload = {};
        try { payload = JSON.parse(line); } catch { /* ignore */ }
        // THE trust boundary. `authorized` DERIVES the sender's identity from
        // its per-agent token; the payload's own `agent_id` claim is discarded.
        // Answer an unauthenticated peer with the same empty object a real hook
        // gets, so the socket is not also a probe for whether it guessed right.
        // The two bound replies ARE distinguishable from `{}`, deliberately: a
        // peer that just sent an oversized or empty payload already knows it
        // did, so the reply leaks nothing about tokens — and the alternative,
        // silence, is the bypass.
        const agentId = this.authorized(payload);
        if (!agentId) { conn.end('{}'); return; }
        let res: unknown = {};
        try { res = this.handle(payload, agentId); } catch { res = {}; }
        conn.end(JSON.stringify(res ?? {}));
      });
      conn.on('error', () => { /* shim hung up — ignore */ });
    });
    server.on('error', (e) => console.error('[hive] hook server error:', e));
    this.server = server;
    server.listen(sock, () => this.armSocketWatchdog(sock));
  }

  /**
   * Re-listen when the socket file goes missing or is replaced (T-P02-12/13).
   *
   * Before this, `listen()` ran exactly once and nothing re-listened, so one
   * `rm "$HIVE_ROOT/hooks.sock"` took the PreToolUse gate down for EVERY agent
   * until the app restarted — the shims exit 0 on a connect error and exit 0
   * with no stdout is *allow*. Worse, an agent that then BOUND that fixed path
   * would collect every other agent's token and answer `allow` to the floor.
   *
   * POSIX only: `sockPath()` is a `\\.\pipe\` NAME on win32 with no filesystem
   * entry, so there is nothing to stat, nothing to `rm`, and a watchdog that
   * threw every 10s there would be a worse bug than the one it fixes.
   */
  private armSocketWatchdog(sock: string): void {
    if (process.platform === 'win32') return;
    try { this.sockIno = statSync(sock).ino; } catch { this.sockIno = null; }
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = setInterval(() => this.checkSocket(sock), this.socketWatchdogMs);
    this.watchdog.unref?.();
  }

  private checkSocket(sock: string): void {
    if (!this.server) return;
    let ino: number | null = null;
    try { ino = statSync(sock).ino; } catch { ino = null; }
    if (ino !== null && ino === this.sockIno) return;
    if (ino === null) {
      // The accident, or a deliberate fail-open: the gate was DOWN for everyone
      // until now. Loud, because nothing else reports it.
      console.error(
        `[hive] hook socket GONE (${sock}) — the PreToolUse gate was open for every `
        + 'agent on this floor until this re-listen. Something deleted it.'
      );
    } else {
      // A different inode on OUR path is someone else listening on it: every
      // shim would hand THEM its per-agent token and take THEIR allow/deny.
      console.error(
        `[hive] hook socket REPLACED (${sock}) — a DIFFERENT socket is bound to the `
        + 'hive hook path. This is what an agent rebinding HIVE_SOCK looks like: it '
        + 'harvests every other agent\'s token and answers every PreToolUse. Re-taking '
        + 'the path now — re-taking is a race we can lose, so check the floor.'
      );
      try { rmSync(sock); } catch { /* it may be gone again already */ }
    }
    try { this.server.close(); } catch { /* noop */ }
    this.server = null;
    this.listenOn(sock);
  }

  stop(): void {
    // Before anything else: an uncleared interval outlives the server, and a
    // leaked one per HookServer construction is its own flake in a test file
    // that builds ~20 of them.
    if (this.watchdog) { clearInterval(this.watchdog); this.watchdog = null; }
    this.sockIno = null;
    try { this.server?.close(); } catch { /* noop */ }
    this.server = null;
    const sock = this.hive.sockPath();
    try { if (sock && existsSync(sock)) rmSync(sock); } catch { /* noop */ }
  }

  /**
   * Mint the hook token for ONE agent's PTY spawn (GATE-01, D-11).
   *
   * `randomBytes` — never a hand-rolled or time-derived value. Called by
   * `pty.ts` at every spawn that carries an AGENT_ID, and the result goes into
   * that ONE PTY's env as HIVE_SOCK_TOKEN. A fresh token per spawn means a
   * restart invalidates the old one for free.
   */
  mintToken(agentId: string): string {
    const token = randomBytes(32).toString('hex');
    this.tokens.set(token, agentId);
    return token;
  }

  /** Drop ONE token — the PTY-exit path. Token-exact rather than by agent on
   *  purpose: a restart is kill()+spawn() under the same id, and the dying
   *  PTY's exit can land AFTER the replacement has already minted, so revoking
   *  by agent there would dead-hook the live agent. */
  revokeToken(token: string): void {
    this.tokens.delete(token);
  }

  /** Drop EVERY token an agent holds — for a teardown where the agent itself is
   *  going away and no replacement is coming. */
  revokeAgent(agentId: string): void {
    for (const [token, id] of this.tokens) if (id === agentId) this.tokens.delete(token);
  }

  /** The transcript file of an agent's CURRENT session, if any hook has fired. */
  transcriptPath(agentId: string): string | undefined {
    return this.transcriptPaths.get(agentId);
  }

  /** The latest context-window accounting for an agent (current tokens + the real
   *  window size), or undefined if no statusLine tick has fired for it yet. */
  contextFor(agentId: string): { tokens: number; limit: number; ts: number } | undefined {
    return this.contextById.get(agentId);
  }

  /**
   * WHO sent this payload — derived, never claimed. Returns the agent id bound
   * to the payload's token at mint time, or null if there is no such token.
   *
   * Deliberately enforced HERE, at the socket, and not inside `handle` — the
   * socket is the trust boundary, and main-side callers that build payloads
   * themselves are already inside it.
   *
   * A plain `Map.get` and no compare: the lookup is a hash of the provided
   * string, so there is no per-byte comparison to leak a prefix and nothing for
   * a `.length` shortcut to bail on. The constant-time compare this file used to
   * run is therefore gone along with the single floor-wide constant it compared
   * against — deleted rather than kept as a dead import, and deliberately not
   * named here, because a later plan greps this file raw for its symbols.
   *
   * FAIL-CLOSED, but never silently: if the PTY env ever stops carrying
   * HIVE_SOCK_TOKEN, every hook for that agent goes dead at once — its avatar
   * freezes, Stop never fires, its cost rows stop landing — and a silent version
   * of that is far harder to diagnose than the hijack it prevents. So each
   * rejection says WHY, with the event, throttled to one line per
   * REJECT_LOG_INTERVAL_MS plus a running count. The payload's OWN `agent_id` is
   * deliberately not logged: it is the unauthenticated claim this gate exists to
   * disbelieve, and printing it invites a reader to trust it.
   */
  private authorized(p: HookPayload): string | null {
    const provided = typeof p.sock_token === 'string' ? p.sock_token : '';
    const agentId = provided ? this.tokens.get(provided) : undefined;
    if (agentId) return agentId;
    this.rejected += 1;
    const now = Date.now();
    if (now - this.lastRejectLog >= REJECT_LOG_INTERVAL_MS) {
      this.lastRejectLog = now;
      console.error(
        `[hive] hook payload REJECTED (${provided ? 'unknown' : 'missing'} sock_token) — `
        + `event=${p.hook_event_name ?? '?'}, ${this.rejected} rejected so far. If this is `
        + 'every hook, the agent PTY env is missing HIVE_SOCK_TOKEN (minted per spawn by '
        + 'mintToken() in hooks.ts); if it is one engine, that engine\'s shim is not '
        + 'sending sock_token at all.'
      );
    }
    return null;
  }

  /**
   * Deny a PreToolUse whose target lands in the hive's own protected set
   * (T-P02-09/12/13). Returns the operator-legible reason, or null to allow.
   *
   * WHY HERE and not in `AGENT_DENY_RULES`: that list is written only into
   * Claude's per-session `settings.json` — by `writeClaudeSettings` in hive.ts,
   * from the `AGENT_DENY_RULES` constant in the same file. Cited by SYMBOL and
   * deliberately not by line: the previous citation here was a line number, a
   * later edit moved the code, and the comment then pointed at an unrelated
   * `spawn bare` branch. A symbol survives the next edit; a number does not.
   * That list does not exist
   * for the agy/codex/grok engines that reuse this very shim, and its `Bash(…)`
   * rules are prefix matches on the command string. This gate is strictly wider
   * on both axes and lives at the choke point every hook-bridged engine already
   * routes through. Per-agent shim COPIES were considered and rejected: the
   * token rides in each PTY's env, not in the shim, so a second copy adds a file
   * without adding a boundary — the copy is exactly as writable as the original.
   *
   * THE CEILING, so this reads as a control and not a claim. WHAT IT NOW IS: a
   * `(dev, ino)` IDENTITY comparison, so a protected path is denied HOWEVER it
   * is spelled — there is deliberately no list of host names, prefixes or
   * spellings anywhere in this file, because an enumeration of an input space
   * the attacker chooses does not converge. WHAT IT STILL DOES NOT REACH:
   *
   *   (a) a model that assembles the path at runtime
   *       (`p=$HIVE_ROOT; p=$p/bin; cat >> $p/cth-hook.cjs`), and a `cd` into a
   *       protected directory followed by a relative write
   *       (`cd $HIVE_ROOT && cat >> bin/cth-hook.cjs`) — the gate reads a command
   *       STRING, not a shell, and Claude Code's `cwd` is the SESSION cwd, not
   *       the post-`cd` one. This also covers a drive-relative target with no
   *       separator (`C:cth-hook.cjs`), which reaches the same object only after
   *       the same prior `cd`;
   *   (b) a harness home containing a SPACE. The Bash arm splits on
   *       `[\s;&|<>()"']+`, so `"$HIVE_ROOT/bin/cth-hook.cjs"` under
   *       `C:\Users\John Smith\…` tears into two words and NEITHER resolves
   *       anywhere near `<hive>/bin` — which turns the whole Bash arm off for
   *       that operator. Pre-existing; a quote-aware tokenizer is its own change;
   *   (c) a HARD LINK to a file under `<hive>/.git` or under another agent's
   *       tree. The `<hive>/bin` case IS closed — identity plus a RECURSIVE scan
   *       of `bin/`, which has to be recursive because `bin/runtime` is on every
   *       agent PTY's PATH — but `.git`'s object store is thousands of files and
   *       an agent tree is unbounded, so identifying every file beneath them per
   *       payload is not a cost this gate can pay;
   *   (d) a local NON-admin SMB share (`\\localhost\<sharename>\…`) whose host
   *       answers but whose backing directory main has no identity for, and any
   *       other path whose `statSync` succeeds on a DIFFERENT object than the one
   *       the OS ultimately writes to;
   *   (e) more distinct path-shaped candidates than HOOK_CANDIDATE_MAX, or more
   *       wall-clock than HOOK_RESOLVE_BUDGET_MS. Both DENY rather than inspect,
   *       so the failure mode is a FALSE DENY with a reason naming the bound;
   *   (f) ONE blocking resolve against storage that does not answer — an
   *       attacker-supplied unreachable UNC host, a dead `net use` letter, a
   *       disconnected removable volume. HOOK_RESOLVE_BUDGET_MS cannot interrupt
   *       a syscall already in flight, so the true worst case is
   *       `budget + one resolve`. Pre-existing: one absolute `file_path` of
   *       `Z:\x` does exactly this today;
   *   (g) a volume with NO STABLE FILE IDS (`ino === 0`). Identity is unavailable
   *       there, so EVERY candidate denies with a reason naming the volume. That
   *       is an outage for that operator, not a bypass, and it is the correct
   *       direction — loud and fail-closed beats silent and fail-open;
   *   (h) the measured false positives of the framing rule: `x:1/2`,
   *       `D:pkg/file.ts`, and a bare rooted regex word like `/^a$/`. A false
   *       deny is the right failure mode for a shape main cannot frame, and
   *       pretending there is none is not;
   *
   * and it does not exist at all for an engine with no PreToolUse hook
   * (T-P02-11). A ceiling list that omits (b), (f) or (g) reads as a guarantee
   * that does not hold.
   *   (i) NO HIVE ROOT AT ALL. `protectedPathDenial` opens with
   *       `if (!root) return null;` — allow. This is T-P24-10, disposition
   *       ACCEPT. The underlying behaviour is benign: with no hive root there
   *       are no protected paths to name, so there is nothing to deny. It is
   *       listed here because an UNRECORDED fail-open in a security gate is what
   *       gets re-discovered as a finding two phases later, and because an
   *       `accept` disposition's whole obligation is to be written down where a
   *       reader of this function will see it. Owner: hive maintainer.
   */
  private protectedPathDenial(agentId: string, p: HookPayload): string | null {
    const root = this.hive.root();
    if (!root) return null;
    const ti = (p.tool_input && typeof p.tool_input === 'object')
      ? p.tool_input as Record<string, unknown>
      : {};
    const targets: string[] = [];
    for (const key of ['file_path', 'path', 'notebook_path']) {
      const v = ti[key];
      if (typeof v === 'string' && v) targets.push(v);
    }
    if (p.tool_name === 'Bash' && typeof ti.command === 'string') {
      // The app puts HIVE_ROOT in every agent's env (hive.ts:828) AND names it in
      // the injected prompt (hive.ts:1366), so `cat >> "$HIVE_ROOT/bin/…"` is the
      // DOCUMENTED calling convention, not obfuscation — a prefix test on the
      // unexpanded string never matches it. Expand the spellings this app itself
      // hands out, then treat the shell words as candidate paths. Splitting on
      // shell separators (not a bare substring scan) is what keeps `>>`, quotes
      // and `;`-chains from hiding a target.
      //
      // FILTER FIRST. A word that contains no separator and does not start with
      // `~`, `.` or a drive letter cannot resolve INTO a protected directory from
      // any base, and resolving it anyway is what made an ordinary heredoc cost
      // 721 ms of blocking main-thread work. Measured on this repo's README:
      // 2612 words in, 102 out.
      const expanded = this.expandHiveVars(agentId, ti.command);
      for (const word of expanded.split(/[\s;&|<>()"']+/)) {
        if (word && pathShaped(word)) targets.push(word);
      }
    }
    if (targets.length === 0) return null;

    const ids = this.hiveIdentities(agentId, root);
    if (!ids) return DENY_NO_STABLE_ID; // (g) — loud, total, and the right direction

    // BUILD the distinct candidate set BEFORE resolving any of it, so the cap
    // below denies without first paying the cost it exists to bound.
    const candidates = new Set<string>();
    let bases: string[] | null = null;
    for (const target of targets) {
      if (driveRelative(target)) return DENY_FRAME;
      const t = expandTilde(target); // `~/…` becomes absolute and is then ordinary
      if (isAbsolute(t)) { candidates.add(t); continue; }
      if (bases === null) bases = this.vouchedBases(agentId, p);
      if (bases.length === 0) return DENY_CANNOT_LOCATE;
      for (const base of bases) candidates.add(join(base, t));
    }
    if (candidates.size > HOOK_CANDIDATE_MAX) {
      return `Denied: this command carries ${candidates.size} distinct path-shaped targets, past `
        + `the ${HOOK_CANDIDATE_MAX} this gate will resolve for one payload. Each one costs an `
        + 'ancestor walk on the app\'s main thread, and truncating the scan instead of denying '
        + 'would hand you the gate for the price of some padding. Split the command.';
    }

    // RESOLVE. Memoised per distinct PARENT DIRECTORY within this one payload —
    // the leaf is always decided on its own, because the leaf is where a leaf
    // symlink, a hard link and an un-created tail live.
    const memo = new Map<string, Containment>();
    let binScan: Set<string> | null | undefined;
    const binIdentities = (): Set<string> | null =>
      (binScan === undefined ? (binScan = this.binEntryIdentities(ids.binPath)) : binScan);
    const deadline = Date.now() + HOOK_RESOLVE_BUDGET_MS;
    for (const candidate of candidates) {
      if (Date.now() > deadline) {
        return `Denied: resolving this command's targets crossed the ${HOOK_RESOLVE_BUDGET_MS}ms `
          + 'budget this gate gives one payload — which happens when a path names storage that '
          + 'does not answer (an unreachable network host, a dead mapped drive). It denies rather '
          + 'than gives up: a gate that cannot finish checking must not allow.';
      }
      const reason = this.candidateDenial(candidate, ids, agentId, memo, binIdentities);
      if (reason) return reason;
    }
    return null;
  }

  /**
   * The ABSOLUTE directories a RELATIVE target may be measured against, in order.
   * Two stages, and the order is the security property.
   *
   * Stage 1, the REGISTRY. `registry().agents[id].cwd`, kept only if
   * `isAbsolute()` says so. That filter is load-bearing, not defensive style:
   * `ensureAgent` stores whatever cwd it was handed (tilde-expanded, but
   * `expandTilde` returns its input untouched when the result is still relative)
   * and merely RECORDS `cwdValid` beside it — `cwdValidity` returns
   * `'not-absolute'` for exactly this case, and `RegistryAgent.cwdValid`'s own
   * JSDoc names it. An unfiltered relative cwd would make the candidate set
   * non-empty, so the deny branch never fires, while `join(relativeCwd, target)`
   * stays relative and resolves against MAIN's cwd — the original bypass wearing
   * its own fix's clothes.
   *
   * Stage 2, the PAYLOAD. `p.cwd`, appended ONLY when stage 1 already produced a
   * base. This ordering is the whole point: with an empty registry set, one
   * attacker-chosen absolute `cwd` would make the set non-empty, no branch would
   * match, and the same write would flip from DENY to ALLOW — one JSON field
   * buying the bypass. Appended to a NON-empty set the old argument does hold:
   * the vouched base is still checked and the loop returns the FIRST deny any
   * base produces, so a lying `cwd` costs the caller a deny and buys nothing,
   * while a truthful one is the only thing that catches a `cd`-relative write.
   *
   * DELIBERATELY ABSENT: `join(hiveRoot, 'agents', agentId)`, which would turn
   * `../node_modules/.bin/tsc` into `<hive>/agents/node_modules/.bin/tsc` and deny
   * ordinary work as "belongs to another agent" — the `owner === agentId` branch
   * already allows an agent its own directory, so that base can only produce
   * false denies. And `hiveRoot` itself, which would deny `cat bin/foo.js` and
   * `cat .git/config` in any ordinary repo: an outage, not a control.
   */
  private vouchedBases(agentId: string, p: HookPayload): string[] {
    const bases: string[] = [];
    let cwd: unknown;
    try { cwd = this.hive.registry().agents[agentId]?.cwd; } catch { cwd = undefined; }
    if (typeof cwd === 'string' && cwd && isAbsolute(cwd)) bases.push(cwd);
    if (bases.length === 0) return []; // DENY before payload.cwd is consulted at all
    if (typeof p.cwd === 'string' && p.cwd && isAbsolute(p.cwd)) bases.push(p.cwd);
    return bases;
  }

  /** Expand the shell spellings of the env vars this app hands every agent, so a
   *  command written the way the injected prompt teaches is still resolvable.
   *
   *  `$NAME` is replaced BOUNDARY-AWARE, not by bare substring. `$HOMEPATH` and
   *  `$HOMEDRIVE` are real Windows variables that begin with `$HOME`, so a bare
   *  `split('$HOME').join(home)` rewrites both into garbage — a silent behaviour
   *  change on every Bash command an agent runs on Windows. `${NAME}` and
   *  `%NAME%` are already unambiguous and are left as plain substring swaps. The
   *  replacement is a FUNCTION so a `$` inside a home directory cannot be read as
   *  a `String.replace` capture reference. */
  private expandHiveVars(agentId: string, cmd: string): string {
    const root = this.hive.root();
    const home = homedir();
    const vars: Record<string, string | null> = {
      HIVE_ROOT: root,
      HIVE_SOCK: this.hive.sockPath(),
      AGENT_DIR: root ? join(root, 'agents', agentId) : null,
      HOME: home,
      USERPROFILE: home
    };
    let out = cmd;
    for (const [name, value] of Object.entries(vars)) {
      if (!value) continue;
      out = out.split(`\${${name}}`).join(value)
        .split(`%${name}%`).join(value)
        .replace(new RegExp(`\\$${name}(?![A-Za-z0-9_])`, 'g'), () => value);
    }
    return out;
  }

  /** The identities of the hive's protected directories, computed ONCE per
   *  payload. `bin`, `.git`, `agents`, the socket and the agent's own directory
   *  may each be absent — absent simply means there is no identity to match, and
   *  the hive ROOT's identity is what still catches a write that would CREATE
   *  them (see `rootTailVerdict`). If the ROOT has no identity the volume has no
   *  stable file ids at all, and the caller denies everything. */
  private hiveIdentities(agentId: string, root: string): HiveIdentities | null {
    const rootId = pathIdentity(root);
    if (!rootId) return null;
    const sock = this.hive.sockPath();
    // win32 sockPath() is a `\\.\pipe\` NAME, not a filesystem path — nothing to
    // stat, nothing to delete, so the whole socket branch is POSIX-shaped.
    const sockFile = sock && process.platform !== 'win32' ? sock : null;
    return {
      root: rootId,
      bin: pathIdentity(join(root, 'bin')),
      git: pathIdentity(join(root, '.git')),
      sock: sockFile ? pathIdentity(sockFile) : null,
      sockName: sockFile ? basename(sockFile) : null,
      agents: pathIdentity(join(root, 'agents')),
      own: pathIdentity(join(root, 'agents', agentId)),
      binPath: join(root, 'bin')
    };
  }

  /** One candidate, decided. */
  private candidateDenial(
    candidate: string,
    ids: HiveIdentities,
    agentId: string,
    memo: Map<string, Containment>,
    binIdentities: () => Set<string> | null
  ): string | null {
    const normalised = win32Components(candidate);
    if (normalised === null) return DENY_COMPONENT;
    let abs = resolve(normalised);

    // A LEAF symlink is the one shape identity cannot see through on its own:
    // `statSync` follows a symlinked ANCESTOR (measured with a junction), so the
    // ancestor walk needs no resolver — but the leaf's own entry does. This is
    // the only remaining use of a path resolver in this file, and it is
    // `.native` with no JS fallback.
    try { if (lstatSync(abs).isSymbolicLink()) abs = realpathSync.native(abs); }
    catch { /* not a link, or not there yet — both are ordinary */ }

    const leaf = pathIdentity(abs);
    if (leaf) {
      if (leaf === ids.bin) return DENY_BIN;
      if (leaf === ids.git) return DENY_GIT;
      if (leaf === ids.sock) return DENY_SOCK;
      // A HARD LINK is a second DIRECTORY ENTRY for the same file, so no
      // canonicalisation can reach it — but its `(dev, ino)` is literally equal.
      // Consulted only for `nlink > 1`, and the scan is RECURSIVE because
      // `<hive>/bin/runtime` is appended to EVERY agent PTY's PATH
      // (hive.ts `runtimeBinDir`, pty.ts `withHiveRuntimeFallback`): a one-level
      // readdir misses it, and a link into `bin/runtime/node.cmd` is arbitrary
      // code execution in every agent on the floor.
      let nlink = 0n;
      try { nlink = statSync(abs, { bigint: true }).nlink; } catch { /* raced away */ }
      if (nlink > 1n) {
        const inBin = binIdentities();
        if (inBin === null) return DENY_BIN_SCAN;
        if (inBin.has(leaf)) return DENY_BIN;
      }
    }

    const parent = dirname(abs);
    let verdict = memo.get(parent);
    if (!verdict) { verdict = this.containment(parent, ids, agentId); memo.set(parent, verdict); }
    if (verdict.deny) return verdict.deny;
    if (verdict.at === 'agents') return this.ownerVerdict(parent, basename(abs), ids, agentId).deny;
    if (verdict.at === 'root') return this.rootTailVerdict(parent, basename(abs), '', ids, agentId).deny;
    return null;
  }

  /**
   * Where `p` sits relative to the hive's protected set, by IDENTITY.
   *
   * Walks UP from `p`, comparing `(dev, ino)` at every level. The first level
   * that matches decides, which is why a match on `<hive>/bin` outranks the
   * hive-root rule below it. If NO level anywhere in the chain can be stat()ed,
   * main cannot say what the path names and the answer is DENY — on a local
   * volume that branch is unreachable (the volume root always stats), so it fires
   * for exactly two classes: an unmapped drive letter, and an unreachable UNC
   * host. That is a deliberate behaviour change in the deny direction, on storage
   * that could not have accepted the write anyway.
   */
  private containment(p: string, ids: HiveIdentities, agentId: string): Containment {
    const levels: string[] = [];
    for (let cur = p; ;) {
      levels.push(cur);
      const parent = dirname(cur);
      if (parent === cur) break;
      cur = parent;
    }
    let identified = false;
    for (let j = 0; j < levels.length; j++) {
      const id = pathIdentity(levels[j]);
      if (!id) continue;
      identified = true;
      if (id === ids.bin) return { deny: DENY_BIN };
      if (id === ids.git) return { deny: DENY_GIT };
      if (id === ids.sock) return { deny: DENY_SOCK };
      if (id === ids.agents) {
        return j === 0
          ? { deny: null, at: 'agents' }
          : this.ownerVerdict(levels[j], basename(levels[j - 1]), ids, agentId);
      }
      if (id === ids.root) {
        return j === 0
          ? { deny: null, at: 'root' }
          : this.rootTailVerdict(
            levels[j], basename(levels[j - 1]), j >= 2 ? basename(levels[j - 2]) : '', ids, agentId);
      }
    }
    return identified ? { deny: null } : { deny: DENY_UNIDENTIFIABLE };
  }

  /** Inside `<hive>/agents`, the level below it is the OWNER. Compared by
   *  IDENTITY when that directory exists and by case-folded NAME when it does
   *  not — an agent may always write its own directory, and a gate that blocks
   *  that is an outage rather than a control. */
  private ownerVerdict(
    agentsDir: string, owner: string, ids: HiveIdentities, agentId: string
  ): Containment {
    if (!owner) return { deny: null }; // `<hive>/agents` itself: unchanged, allowed
    const id = pathIdentity(join(agentsDir, owner));
    if (id && ids.own && id === ids.own) return { deny: null };
    if (fold(owner) === fold(agentId)) return { deny: null };
    return { deny: denyOtherAgent(owner) };
  }

  /**
   * THE FRESH-HIVE RULE, and it is what makes identity safe on a hive whose
   * `bin/`, `.git/` and `agents/` do not exist yet.
   *
   * With those directories absent there is no identity to match, so the walk
   * reaches the hive ROOT — an object main HAS identified — and the un-created
   * tail below it is compared by case-folded NAME against the FOUR protected
   * literals. Four, not three: `sockPath()` is `<hive>/hooks.sock` on POSIX and
   * the window in which it is missing is real (the watchdog period is 10 s, and
   * this file's own comment says re-taking it is a race we can lose).
   *
   * This is the ONE place a name is still compared, and it is a space of four
   * literal strings inside a directory whose identity is already established —
   * not a space of spellings.
   */
  private rootTailVerdict(
    rootDir: string, child: string, grandchild: string, ids: HiveIdentities, agentId: string
  ): Containment {
    if (!child) return { deny: null };
    const c = foldProtected(child);
    if (c === 'bin') return { deny: DENY_BIN };
    if (c === '.git') return { deny: DENY_GIT };
    if (ids.sockName && c === foldProtected(ids.sockName)) return { deny: DENY_SOCK };
    if (c === 'agents') return this.ownerVerdict(join(rootDir, child), grandchild, ids, agentId);
    return { deny: null };
  }

  /** Every file beneath `<hive>/bin`, RECURSIVELY, by identity — or null when the
   *  bound is crossed, which DENIES. Used only for a candidate whose `nlink > 1`.
   *  `readdirSync(..., { withFileTypes: true })` reports a symlink as a link, not
   *  a directory, so this cannot be walked into a cycle. */
  private binEntryIdentities(binPath: string): Set<string> | null {
    const out = new Set<string>();
    const stack = [binPath];
    let seen = 0;
    while (stack.length > 0) {
      const dir = stack.pop() as string;
      let entries;
      try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const entry of entries) {
        if (++seen > HOOK_BIN_SCAN_MAX) return null;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) { stack.push(full); continue; }
        const id = pathIdentity(full);
        if (id) out.add(id);
      }
    }
    return out;
  }

  private handle(p: HookPayload, agentId: string): unknown {
    const event = p.hook_event_name ?? 'Unknown';
    if (agentId && typeof p.transcript_path === 'string' && p.transcript_path) {
      this.transcriptPaths.set(agentId, p.transcript_path);
    }

    // Status-line payloads carry the session's EXACT context accounting —
    // current tokens AND the real window size (200k vs 1M, which nothing else
    // exposes). Forward to the renderer for the agent-card context gauge.
    // Handled FIRST and returned early: this is pure telemetry from the
    // statusLine shim, not a real hook boundary — it must never trip the
    // HALT gate or feed the breaker's loop detector below. The early return
    // also (deliberately) skips recordSession for status ticks: a statusLine
    // payload's session_id adds nothing the real hooks don't already record,
    // and telemetry should never write to the registry. transcript_path IS
    // still captured above, where every payload shape benefits from it.
    if (event === 'Status') {
      const cw = p.context_window;
      if (agentId && cw && typeof cw.total_input_tokens === 'number'
        && typeof cw.context_window_size === 'number' && cw.context_window_size > 0) {
        // Retain for main-side reads (voice get_agent_detail / list_agents) …
        this.contextById.set(agentId, {
          tokens: cw.total_input_tokens,
          limit: cw.context_window_size,
          ts: Date.now()
        });
        // … and forward live to the renderer's agent-card context gauge.
        this.getWebContents()?.send('hive:contextUpdate', {
          agentId,
          tokens: cw.total_input_tokens,
          limit: cw.context_window_size
        });
      }
      return {};
    }

    // 7C.3 — a graceful operator HALT overrides everything (incl. the inbox
    // drain below): stop the agent CLEANLY at this hook boundary rather than
    // killing the PTY. session_id is in the payload for a later --resume.
    if (agentId && this.control?.shouldHalt(agentId)) {
      this.emit(agentId, event, p);
      return { continue: false, stopReason: 'Halted by the operator from the floor.' };
    }

    // Capture the Claude Code session id for idempotent --resume + cost dedup
    // (Lane A #6.6a). Cheap: recordSession writes only when it changes.
    // Sink 4 of 4 (plan 01-25) — the WRITER validates as well as the reader.
    // recordSession() git-commits this string into registry.json, the hive log
    // and the cost ledger, and index.ts hands `hive.lastSession()` straight to
    // argv as `--resume <sid>` on the next restart. Since that argv sink now
    // refuses a flag-shaped id, storing one would sever this agent's resume
    // continuity permanently — one forged hook payload, and "Restart & Continue"
    // never works again. Refusing here is what keeps the two ends agreeing.
    if (agentId && p.session_id) {
      if (SPAWN_SAFE_SESSION_ID.test(p.session_id)) this.hive.recordSession(agentId, p.session_id);
      else if (Date.now() - lastSessionRejectLog >= REJECT_LOG_INTERVAL_MS) {
        lastSessionRejectLog = Date.now();
        console.error(`[hive] refusing to STORE a session id that is not argv-safe for ${agentId} `
          + `(length ${p.session_id.length}, event=${event}) — a session id becomes argv on the next `
          + 'resume, so this one is dropped rather than committed to registry.json');
      }
    }

    // CostSample — synthesized by the proxy-bridge sidecar (qwen/crush) on every
    // response with usage. Its numbers are PER-RESPONSE DELTAS.
    //
    // RECORD-04 (#34) — WHY THE HAND-BUILT LEDGER ROW IS GONE FROM HERE.
    // This branch used to call the hive's cost-ledger appender directly with
    // those deltas, while the ~30s beat (index.ts: `getAgentUsage(id)` → that
    // same appender) writes CUMULATIVE snapshots for everyone else.
    // One append-only file, two row semantics — and `taskSpend()` summed both,
    // over-counting roughly quadratically. `src/main/db.ts:44` states the
    // contract the beat obeys and this path broke, verbatim: "Rows are
    // CUMULATIVE snapshots (one per agent per heartbeat beat) — diff consecutive
    // rows for velocity." So the ledger has ONE writer again, with one semantics.
    //
    // FLOOR-09 (#19) — WHERE THE SAMPLE GOES INSTEAD, AND WHY THE EARLY RETURN
    // STAYS. It is handed to the injected `recordCost` sink
    // (`telemetry.recordCostSample` in production), which accumulates it in the
    // SAME collector the OTel path fills. So the branch now reaches:
    //   - `telemetry.getAgentUsage(agentId)`, and therefore the circuit
    //     breaker's cost, token and velocity arms — qwen/crush spend can arm a
    //     budget for the first time instead of only being archived;
    //   - the cost ledger, but INDIRECTLY, via the ~30s beat writing this
    //     agent's cumulative row like everyone else's. That indirection is the
    //     whole of RECORD-04's fix.
    // And it still does NOT reach the loop detector, the OTel span buffer or the
    // Stop/drain path below — cost is pure telemetry and a CostSample is not a
    // tool call. That is what the early `return {}` is for; it is rewritten
    // here, not deleted.
    // Deliberately NO fallback to the ledger appender when the sink is absent:
    // that would be the mixed-semantics defect above, reintroduced as a default.
    // An unwired sink must mean "no proxy row", visibly, not "the old wrong row".
    if (event === 'CostSample') {
      if (agentId && p.session_id) {
        const input = p.input ?? 0;
        const output = p.output ?? 0;
        const cacheRead = p.cache_read ?? 0;
        const cacheCreation = p.cache_creation ?? 0;
        this.recordCost?.({
          agentId,
          sessionId: p.session_id,
          ts: Date.now(),
          input,
          output,
          cacheRead,
          cacheCreation,
          model: p.model ?? '',
          usd: estimateCostUsd(p.model, {
            inputTokens: input,
            outputTokens: output,
            cacheReadTokens: cacheRead,
            cacheWriteTokens: cacheCreation
          })
        });
      }
      return {};
    }

    // Feed the breaker its hook-derived loop signal: a tool that actually ran.
    // A repeated identical (name+input) PostToolUse is the runaway-loop tell.
    if (event === 'PostToolUse' && agentId) {
      this.breaker?.recordToolUse(agentId, p.tool_name, p.tool_input);
    }

    // Compaction exemption (issue #109): PreCompact opens it so the compaction
    // token burst can't trip the Δoutput arms; PostCompact — or any SessionStart,
    // since a fresh session makes in-flight compaction state moot — closes it
    // down to the trailing grace (a no-op when nothing was compacting).
    if (event === 'PreCompact' && agentId) this.breaker?.recordCompactStart(agentId);
    if ((event === 'PostCompact' || event === 'SessionStart') && agentId) {
      this.breaker?.recordCompactEnd(agentId);
    }

    // Turn clock for the "long task finished" toast (#42). A prompt submission is
    // the only unambiguous start-of-turn boundary the hook stream exposes.
    if (event === 'UserPromptSubmit' && agentId && !this.turnStartedAt.has(agentId)) {
      this.turnStartedAt.set(agentId, Date.now());
    }

    if ((event === 'Stop' || event === 'SubagentStop') && agentId) {
      // Respect any upstream Stop hook that already re-entered this boundary.
      if (p.stop_hook_active) { this.emit(agentId, event, p); return {}; }
      // A SubagentStop is a sub-agent finishing INSIDE the parent's turn: the turn
      // is not over, so neither the inbox drain (whose continuation would land in
      // the subagent) nor the turn clock applies to it.
      if (event === 'SubagentStop') { this.emit(agentId, event, p); return {}; }
      const turnMs = this.closeTurn(agentId);
      // #5 — the GUARDED inbox drain, restored. Unread hive mail becomes this
      // turn's continuation instead of rotting until something types a nudge, and
      // it types NOTHING: the agent's own turn carries the work, so nothing can
      // land on the human's input line.
      //
      // The old unguarded version was removed for a real reason — it bypassed the
      // terminal-draft/HITL gate and could spend credits while a human was
      // mid-answer. DeliveryService now holds both guards main can actually check:
      // the operator's auto-delivery pause, and the renderer's draft/picker veto
      // (`hive:deliveryVeto`). Neither depends on a window being open, so the
      // drain keeps working headless — which is the whole point of issue #5.
      const drain = this.drainAtStop?.(agentId);
      if (drain?.block && drain.reason) {
        this.emit(agentId, event, p);
        // Codex honours the same contract: block + reason = "continue, using
        // reason as the next prompt" (see installCodexHooks in hive.ts).
        return { decision: 'block', reason: drain.reason };
      }
      // #42 — an idle agent is the LEAST urgent thing that happens on this floor,
      // and a toast for every turn-end trains the human to ignore all of them.
      // Only a long task finishing is worth the interruption.
      if (turnMs >= LONG_TURN_MS) {
        this.notify(agentId, this.agentName(agentId), `finished after ${Math.round(turnMs / 60_000)} min`);
      }
      this.emit(agentId, event, p);
      return {};
    }

    // GATE-01 — the hive's own protected set: the shared shim, the hive repo's
    // .git, the socket, and other agents' directories. FIRST, and deliberately
    // outside the `this.control` guard below: this is a floor invariant, not an
    // operator preference, so it must hold on a floor with no ControlRegistry.
    if (event === 'PreToolUse') {
      const denial = this.protectedPathDenial(agentId, p);
      if (denial) {
        this.emitControl(agentId, p.tool_name, denial);
        this.emit(agentId, event, p, true);
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: denial
          }
        };
      }
    }

    // 7C.1 — HITL gate: deny a tool call at the PreToolUse boundary when the
    // agent is paused or this tool is gated. Race-free (immediate return, no
    // renderer round-trip → can't hit the shim timeout). Slow human APPROVAL is
    // deliberately left to Claude's native permission prompt.
    if (event === 'PreToolUse' && agentId && this.control) {
      const d = this.control.toolDecision(agentId, p.tool_name ?? '');
      if (d.deny) {
        this.emitControl(agentId, p.tool_name, d.reason);
        this.emit(agentId, event, p);
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: d.reason ?? 'Denied by operator.'
          }
        };
      }
    }

    // 7C.2 — mid-run steering: inject queued operator guidance as context on the
    // next eligible hook (no fragile typing into the TUI). Delivered once.
    // Merged with the roster line below so the two injections never displace each
    // other (only ONE additionalContext can be returned per hook).
    let steer: string | null = null;
    if ((event === 'UserPromptSubmit' || event === 'PostToolUse') && agentId && this.control) {
      steer = this.control.takeSteer(agentId) ?? null;
    }

    // Keep god's roster CURRENT. fleet.json is always fresh on disk, but god's
    // context is not: after a restart it resumes a transcript describing the old
    // floor and messages agents that are long gone. Push the live roster in as
    // additionalContext at the start of each session and on every prompt, so god
    // knows the floor all the time instead of only when it remembers to Read.
    // God-only and one line — every other agent is unaffected.
    const wantsRoster = (event === 'SessionStart' || event === 'UserPromptSubmit')
      && !!agentId && this.hive.isGod(agentId);
    const roster = wantsRoster ? this.hive.rosterContext() : null;

    if (steer || roster) {
      this.emit(agentId, event, p);
      return {
        hookSpecificOutput: {
          hookEventName: event,
          additionalContext: [roster, steer].filter(Boolean).join('\n\n')
        }
      };
    }

    // #42 — EVERY Notification hook is a toast now, not just the idle one.
    //
    // This used to fire for `idle` alone and deliberately skipped permission
    // requests, on the theory that they "surface natively in the agent's own
    // Claude Code session". They do — in a session nobody is looking at. Blocked
    // on a prompt is the single case where the floor genuinely cannot proceed
    // without the human, so it is exactly the one that must reach them; idle is
    // the case that can wait. Same `notifications` setting gates both.
    if (event === 'Notification' && agentId) {
      this.notify(agentId, this.agentName(agentId), p.message ?? 'needs your attention');
    }

    // Forward everything else to the renderer so avatars reflect real activity.
    this.emit(agentId, event, p);
    return {};
  }

  /**
   * FLOOR-14 (#42) — the ONE way a blocked NON-Claude agent reaches an OS toast.
   *
   * Three of FLOOR-14's four clauses already shipped: click-to-focus, the
   * long-task toast, and the blocked-Claude toast (the `event === 'Notification'`
   * branch above). The residual was narrow and total: `status: 'blocked'` for an
   * engine with no hook `Notification` stream is a RENDERER determination —
   * `usePtyParser` matching an approval prompt in the terminal tail — so main
   * never learned about it and the human got nothing at all.
   *
   * PUBLIC on purpose, and as narrowly as the job allows: `notify` stays private,
   * this takes an agent id and nothing else, and every decision that could be
   * abused is made HERE off the live registry rather than read off the payload.
   * The renderer names an agent; it does not get to choose the title, the body,
   * the click target, or whether a toast happens at all.
   */
  notifyBlocked(agentId: string): void {
    if (!agentId) return;
    // T-P13-06 — resolve the renderer-supplied id against the LIVE roster first.
    // An id naming no live agent is dropped: nothing may raise a toast (or arm a
    // click-to-focus) for an agent that does not exist on this floor.
    const agent = (() => {
      try { return this.hive.registry()?.agents?.[agentId]; } catch { return undefined; }
    })();
    if (!agent) return;
    // T-P13-03 — a Claude agent's blocked state ALREADY arrives on its own hook
    // `Notification` stream and is toasted a few lines above. Firing here too is
    // two toasts for one event, which is exactly how a floor teaches its operator
    // to mute notifications. `provider` is unset on legacy records, which means
    // Claude (see AgentMeta), so the default must be the SKIP side.
    if (isClaudeProvider(agent.provider ?? 'claude')) return;
    // UI-SPEC's locked copy: the agent's bare name as the title, a lowercase verb
    // phrase completing it as the body. No exclamation mark — DESIGN.md:653
    // reserves those for completions, and being stuck is not one. Who it is
    // parked on is MAIN's call off the registry, for the same reason the id is.
    const isGod = agent.isGod === true;
    this.notify(agentId, this.agentName(agentId),
      isGod ? 'is waiting on you' : 'is waiting on Michael');
  }

  /** Fire a native desktop notification — gated on the user's `notifications`
   *  setting. Only the OS toast is gated; the hive:hookEvent emit is always sent
   *  so avatars/UI stay live regardless. Best-effort: never throw into the hook.
   *
   *  CLICK-TO-FOCUS (#42): a toast that only says a name is a puzzle — the human
   *  still has to find the agent. Clicking raises the floor and selects it. */
  private notify(agentId: string | undefined, title: string, body: string): void {
    if (!this.getConfig().notifications) return;
    try {
      if (!Notification.isSupported()) return;
      const n = new Notification({ title, body });
      if (agentId) n.on('click', () => { try { this.focus?.(agentId); } catch { /* window gone */ } });
      n.show();
    } catch { /* notifications unsupported on this platform — ignore */ }
  }

  /** The agent's display name for a toast title, falling back to its id. */
  private agentName(agentId: string | undefined): string {
    if (!agentId) return 'Agent';
    try { return this.hive.registry().agents[agentId]?.name ?? agentId; }
    catch { return agentId; }
  }

  /** Close the current turn and return how long it ran (0 when we never saw it
   *  start — a first Stop after a restart must not read as an infinite task). */
  private closeTurn(agentId: string): number {
    const started = this.turnStartedAt.get(agentId);
    this.turnStartedAt.delete(agentId);
    return started ? Date.now() - started : 0;
  }

  /** Tell the renderer a tool call was gated/denied (#7C.1) so it can surface it
   *  (toast / control strip) — distinct from the avatar hook stream. */
  private emitControl(agentId: string, tool: string | undefined, reason: string | undefined): void {
    this.getWebContents()?.send('control:approvalRequest', { agentId, tool, reason });
  }

  private emit(agentId: string | undefined, event: string, p: HookPayload, blocked = false): void {
    this.getWebContents()?.send('hive:hookEvent', {
      agentId,
      event,
      tool: p.tool_name,
      notificationType: p.notification_type,
      source: p.source,
      message: p.message,
      blocked
    });
  }
}
