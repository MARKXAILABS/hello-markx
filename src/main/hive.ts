/**
 * The Hive — the on-disk multi-agent coordination layer.
 *
 * Lives under `<harnessHome>/hive/` as a single git repo that ONLY this main
 * process commits to (agents never call git — they just write files). See
 * HIVE.md for the full design. Responsibilities:
 *   - per-agent workspace (identity.md, memory.md, inbox/, outbox/, cursor.json)
 *   - a roster (registry.json), shared blackboard (board.md), task ledger,
 *     and an append-only event log (log.jsonl)
 *   - a router that drains each agent's outbox into recipients' inboxes
 *
 * Human-in-the-loop is native to each agent's Claude Code session: permission
 * prompts surface in the agent's own terminal (and can be approved remotely via
 * `/remote-control`). The hive keeps no separate approval queue — a message aimed
 * at "human" is routed to the god/orchestrator, the human's proxy on the floor.
 *   - single-committer git with retry/backoff + stale-lock recovery
 *
 * Everything here runs in the Electron main process.
 */
import {
  existsSync, mkdirSync, readFileSync, writeFileSync, renameSync,
  readdirSync, statSync, rmSync, appendFileSync, symlinkSync, copyFileSync, chmodSync,
  openSync, readSync, closeSync
} from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync, spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import type { AgentUsageSample } from './usage';
import { COMMAND_GROUPS } from '../shared/claudeCommands';
import {
  isClaudeProvider,
  isHiveAwareProvider,
  canReceiveInbox,
  providerPreset,
  bridgeOf,
  type AgentProvider
} from '../shared/agentProvider';
import { MCP_CATALOG } from '../shared/mcpCatalog';
import { expandTilde } from './fs';
import { memoryBin } from './memory';

/** The subset of HarnessConfig the hive consumes for the default-MCP merge.
 *  Kept as a local shape so hive.ts never imports the foundation-owned config
 *  module just for a type. */
type McpDefaultsMap = { [id: string]: { enabled: boolean } } | undefined;

// ─── Types ──────────────────────────────────────────────────────────────────

export type MessageAct = 'request' | 'inform' | 'propose' | 'query' | 'agree' | 'refuse' | 'done';

export interface HiveMessage {
  id: string;
  conversation: string;
  in_reply_to: string | null;
  from: string;
  to: string;                 // an agentId, 'god', or 'broadcast'
  act: MessageAct;
  subject: string;
  body: string;
  hops: number;
  requires_reply: boolean;
  needs_human: boolean;
  created_at: string;
}

/** One hive message reshaped for the voice read-layer (`hive:messages`): the
 *  operator-briefing view of an inbox/outbox message. `subject` and `body` are
 *  REDACTED main-side (see {@link redactSecrets}) before this ever leaves the
 *  main process — the renderer/voice layer never sees a raw body, and never a
 *  secret. PII-free + secret-free by construction. */
export interface VoiceMessage {
  id: string;
  conversation: string;
  from: string;
  to: string;
  act: MessageAct;
  /** REDACTED subject line. */
  subject: string;
  /** REDACTED message body. */
  body: string;
  requires_reply: boolean;
  /** Which mailbox folder this copy was read from, relative to `owner`. */
  direction: 'inbox' | 'outbox';
  /** The agent whose mailbox this copy lives in. */
  owner: string;
  /** True when read from an archived/handled subfolder (inbox/.done, outbox/.sent). */
  archived: boolean;
  created_at: string;
}

/** One question→answer exchange with the human, recorded ON the task card so
 *  the decision trail stays with the work it unblocked. */
export interface HumanQA {
  q: string;
  a?: string;
  askedAt?: string;
  answeredAt?: string;
  dismissedAt?: string;
}

export interface HiveTask {
  id: string;
  title: string;
  description?: string;
  assignee?: string;
  status: 'todo' | 'doing' | 'blocked' | 'done';
  dependsOn: string[];
  priority: number;
  createdAt: string;
  /** First-class human feedback: the god appends {q} when a card can only
   *  proceed with the human's input (status goes blocked); the harness UI
   *  fills in {a}. The full history stays on the card forever. */
  humanQA?: HumanQA[];
  /** Outcome summary, surfaced by the Slack done-notifier when this card reaches
   *  'done'. Optional; the notifier falls back to description/title. */
  result?: string;
  /** Set when this task originated from a Slack message — the thread the
   *  done-summary reply is posted back into. Consumed OUTBOUND only; populating
   *  it is the inbound/kanban side's job and does not affect routing. */
  slack?: { channel: string; thread_ts: string };
  /** Set when this task originated from a generic webhook POST. Stores the SHA-256
   *  of the capability token (never the raw token — that's returned to the caller
   *  once and never persisted), so a GET status lookup can match by hashing the
   *  presented token. Read-only capability: it never widens routing or exposure. */
  webhook?: { tokenHash: string };
  /** Peer review of a finished card (#18). `act:'done'` used to be terminal with
   *  no reviewer, so "is this actually done?" was always a human question. When a
   *  card reaches 'done' the review sweep asks the least-loaded idle non-assignee
   *  to check it; their `agree` sets `ok:true`, their `refuse` sets `ok:false` and
   *  sends the card back to 'doing'. */
  review?: { by: string; askedAt: string; ok?: boolean };
  /** Per-card token cap set at dispatch (#34). Cost-ledger rows carry `task_id`,
   *  so spend against ONE card is attributable — see taskSpend(), which is the
   *  read side breaker.ts enforces against. */
  budgetTokens?: number;
}

/** The task ledger exactly as it is persisted to `tasks.json`.
 *
 *  `rev` is the whole point: the ledger has several independent writers (the god
 *  hand-editing it, the renderer patching a card, the webhook/Slack paths, the
 *  realtime actions) and none of them could tell that the copy they read 30 s ago
 *  had been superseded — so a write-back silently erased whatever landed in
 *  between (#17). Every mutation now compare-and-swaps on `rev`; a stale write is
 *  REFUSED rather than applied. */
export interface TaskLedger {
  tasks: HiveTask[];
  rev: number;
  updatedAt: string;
}

/** Drop the DERIVED fields `tasks()` adds for the card meter before anything is
 *  persisted (D-22 / #34).
 *
 *  `tasks()` widens each row with `{tokens, budgetTokens, pct}` so the renderer
 *  gets a meter through the channel it already polls. Two production paths then
 *  read rows straight out of `tasks()` and hand those SAME objects back to
 *  `writeTasks()` — the webhook card-creation path in `src/main/index.ts`
 *  (`const ledger = hive.tasks()` … `hive.writeTasks([...existing, card])`) and
 *  every voice task action in `src/main/realtimeActions.ts` (`findTasks` →
 *  `hiveWriteTasks`). Without this, the first webhook card or voice command
 *  after the widening writes a derived, immediately-stale meter into tasks.json
 *  as if it were card data.
 *
 *  One strip at the single choke point every persist goes through, rather than a
 *  guard at each call site — `writeTasks` is also what `mutateTasks` (and so
 *  addTask/patchTask/deleteTask) funnels through. `budgetTokens` is a REAL card
 *  field and is kept; only the `null` that `tasks()` uses for "no cap" is
 *  dropped back to absent, so a capless card is not given a null cap field. */
const stripDerivedTaskFields = (task: HiveTask): HiveTask => {
  const card: HiveTask & { tokens?: unknown; pct?: unknown } = { ...task };
  delete card.tokens;
  delete card.pct;
  if (typeof card.budgetTokens !== 'number') delete card.budgetTokens;
  return card;
};

export interface AgentMeta {
  id: string;
  name: string;
  /** Which CLI this agent runs on. Defaults to 'claude' when unset (legacy). */
  provider?: AgentProvider;
  role?: string;
  capabilities?: string[];
  cwd: string;
  isGod?: boolean;
  /** Michael's prep assistant — enriches prompts and forwards them to Michael.
   *  Send-only: excluded from broadcast fan-out so it never drains an inbox. */
  isAssistant?: boolean;
  /** Claude account-pool id (HarnessConfig.claudeAccounts) this agent is pinned
   *  to. Unset = the machine's `/login` account (today's behaviour). The id only
   *  — the setup-token stays in the secret broker and is injected MAIN-ONLY at
   *  spawn (never persisted here / in registry.json). Claude-provider only;
   *  ignored for other engines. With `accountPolicy: 'auto'` this is the account
   *  the pool RESOLVED at the last spawn (the live assignment), not a pin. */
  account?: string;
  /** `'auto'` = the pool picks the least-loaded healthy account at every
   *  spawn; unset = pinned to `account` (or the login account when that is
   *  unset too). */
  accountPolicy?: 'auto';
}

export interface RegistryAgent extends AgentMeta {
  status: 'idle' | 'working' | 'blocked' | 'gone';
  lastSeen: number;
  /** True once the agent's terminal/PTY tab is closed. The record is retained
   *  (not deleted) so its history/memory survive; only agents with a live PTY
   *  are 'active'. Broadcast fan-out + roster reads skip archived agents. */
  archived?: boolean;
  /** Most recent Claude Code session_id seen for this agent (Lane A #6.6a),
   *  captured from hook payloads. Doubles as the `--resume` key (idempotent
   *  resume after a crash/restart) AND the cost accounting/dedup key on every
   *  AgentUsageSample / cost-ledger row. */
  sessionId?: string;
  /** Whether `cwd` is actually usable for a (re)spawn — i.e. an ABSOLUTE path
   *  that exists as a directory. Computed + persisted at spawn so the roster
   *  reliably exposes each worker's environment validity. A non-absolute fragment
   *  (e.g. "ClaudeTerminalHarness") spawns into a nonexistent dir and fails; this
   *  flag makes that visible instead of letting it slip through silently. */
  cwdValid?: boolean;
}

export interface Registry {
  godId: string | null;
  agents: Record<string, RegistryAgent>;
}

/** One open `requires_reply` obligation, persisted in `pending-replies.json` so
 *  a restart doesn't forget who owes whom an answer (#18). */
interface PendingReply {
  id: string;
  from: string;
  to: string;
  subject: string;
  conversation: string;
  /** When the sweep next acts on this: re-deliver once, then escalate to god. */
  due: number;
  redelivered: boolean;
}

/** Build env + extra spawn args that make an agent process hive-aware. */
export interface SpawnInjection {
  args: string[];
  env: Record<string, string>;
  /** The hive-protocol seed to TYPE into the TUI after boot rather than pass on
   *  argv — set only for `seedDelivery:'type-into-tui'` providers (Crush), whose
   *  bare TUI rejects a positional seed. The renderer types it through the same
   *  per-pty write-chain as the inbox-wake nudge. (ondev-b) */
  seedPrompt?: string;
}

const HOP_CAP = 12;

// ─── protocol deadlines (#18) ───────────────────────────────────────────────
/** How long a `requires_reply` message may sit unanswered before the sweep acts.
 *  First expiry re-delivers it once; the second bounces it to god as
 *  `[unanswered]`. `requires_reply` was set on every request/query/propose and
 *  enforced by NOTHING, so a worker that died after its nudge left the requester
 *  waiting forever with no signal at all. */
const REPLY_DEADLINE_MS = 15 * 60_000;
/** How often the router tick actually runs the deadline + review sweeps. The
 *  router itself ticks every 1.5 s; these are minute-scale concerns. */
const SWEEP_INTERVAL_MS = 60_000;
// RECORD-03 (#34): the 1 MB `COST_TAIL_BYTES` window that `taskSpend()` used to
// read through is DELETED, not widened. Its own comment already named the defect
// ("a card whose spend predates this window under-reports"), and an under-report
// is exactly the case where `over` reads false while the card is over its cap —
// the number FLOOR-10 enforces against. The bounded-read discipline it borrowed
// from `logTail` is right for a log tail and wrong for an accounting total: a
// total that silently drops its oldest rows is not a total. What replaces the
// bound is `costByTask` below — an in-memory accumulator built by ONE scan and
// then kept current incrementally, so the file is never re-slurped per query.

/**
 * Where the hive's own `git` looks for hooks: nowhere.
 *
 * The hive root IS a git repo (`git init` in ensureHive) and both wrappers below
 * spawn `git` as a child of the Electron MAIN process, inheriting main's
 * environment. Nothing stopped an agent writing `<root>/.git/hooks/pre-commit`
 * and having the next hive commit execute it — arbitrary code with more
 * privilege than the agent that planted it, reached from outside the PreToolUse
 * write gate (which cannot see the pi, opencode or proxy tiers at all).
 *
 * `core.hooksPath` rather than `--no-verify`, deliberately: `--no-verify`
 * suppresses only `pre-commit`/`commit-msg` on a commit, leaves `post-commit`
 * and every other hook running, and would have to be repeated at each of the
 * seven commit() call sites. This is one flag in the shared `-c` prefix of BOTH
 * wrappers — either can be the next writer — and it disables every hook for
 * every git invocation the hive makes.
 *
 * THE CEILING, stated rather than implied. This protects git runs the HIVE
 * makes; an agent running `git` in its own shell still runs its own hooks, and
 * that is its own repo's business. And `/dev/null` is a char device no
 * unprivileged process can turn into a directory on POSIX — on win32 the string
 * resolves to a drive-root path instead, which is weaker, so the behavioural
 * test in test/engine-parity.test.cjs asserts the hook does not fire rather than
 * asserting the flag is present.
 */
const GIT_HOOKS_DISABLED = '/dev/null';

// ─── git + log budgets ──────────────────────────────────────────────────────
// Every number here used to be an order of magnitude larger and paid for on the
// MAIN THREAD (see commit()). They are deliberately small: git is history, not
// data — the files are already durable on disk before any of this runs.

/** Trailing debounce on hive commits. A busy floor commits per message; one
 *  commit per 5 s window is the same history at a fraction of the git. */
const COMMIT_DEBOUNCE_MS = 5_000;
/** Per-git-child timeout on the commit path. */
const GIT_TIMEOUT_MS = 2_000;
/** Attempts before a commit gives up — the NEXT mutation retries anyway. */
const GIT_ATTEMPTS = 2;
/** Base backoff between attempts (async timer, never a blocking sleep). */
const GIT_RETRY_MS = 50;
/** FLOOR-04 bound on the staged diff the secret scrub will scan, in LINES
 *  (added + deleted, straight off `--numstat`). Measured BEFORE the content diff
 *  is ever pulled into memory, so a pathological commit is turned away rather
 *  than buffered — `--numstat` costs one short row per changed PATH, not per
 *  byte. Past this the scan is skipped and said out loud; never skipped quietly. */
const SECRET_SCAN_MAX_LINES = 20_000;
/** …and a byte bound on the text actually handed to the matcher, because a line
 *  count does not bound bytes: one minified 10 MB line is a single line to
 *  `--numstat`. Beyond this only the first slice is scanned, and the shortfall
 *  is logged rather than presented as a clean scan. */
const SECRET_SCAN_MAX_BYTES = 4 * 1024 * 1024;
/** How old `.git/index.lock` must be before we treat it as abandoned. Must stay
 *  comfortably ABOVE GIT_TIMEOUT_MS — the old 10 s was BELOW the old 8 s git
 *  timeout, so a slow-but-alive git (a big `add -A` behind Windows antivirus)
 *  could have its live lock deleted out from under it. */
const STALE_LOCK_MS = 60_000;
/** Rotate log.jsonl past this size (one generation kept). It is append-only with
 *  a dozen writers and was never rotated. */
const LOG_ROTATE_BYTES = 8 * 1024 * 1024;
/** How much of log.jsonl's tail logTail() reads. Bounded so an IPC/voice read
 *  never slurps a multi-megabyte file to show the last 200 events. */
const LOG_TAIL_BYTES = 64 * 1024;
/** Paths the hive repo must stop VERSIONING — see untrackIgnored(). Mirrors the
 *  churny half of the .gitignore seed in ensureHive; a `.gitignore` line alone
 *  does nothing to a file git is already tracking. */
const UNTRACK_PATHS = ['cost-ledger.jsonl', 'log.jsonl', 'log.jsonl.1', 'backups'];

/** Filesystem- and sort-safe timestamp, e.g. 2026-05-30T14-03-11-123Z. */
function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function shortRand(): string {
  return randomBytes(3).toString('hex');
}

/** Non-memory files `mempalace mine` must not ingest (Claude Code hooks config,
 *  cursor, raw inbox/outbox JSON). `mempalace mine` honors .gitignore, so we drop
 *  one in each agent dir; written on birth here and refreshed by the mine loop. */
const MINE_IGNORE_LINES = ['settings.json', 'cursor.json', 'inbox/', 'outbox/'];

/** Idempotently ensure `<agentDir>/.gitignore` excludes the non-memory files.
 *  Append-only: writes only the missing lines, leaving any existing entries. */
function ensureMineIgnore(agentDir: string): void {
  const path = join(agentDir, '.gitignore');
  let existing = '';
  try { if (existsSync(path)) existing = readFileSync(path, 'utf8'); } catch { return; }
  const have = new Set(existing.split('\n').map((l) => l.trim()));
  const missing = MINE_IGNORE_LINES.filter((l) => !have.has(l));
  if (missing.length === 0) return;
  const prefix = existing && !existing.endsWith('\n') ? existing + '\n' : existing;
  try { writeFileSync(path, prefix + missing.join('\n') + '\n', 'utf8'); } catch { /* best-effort */ }
}

/**
 * Strip secret-shaped substrings out of free text before it leaves the main
 * process toward the voice / renderer layer. This is the MAIN-SIDE privacy gate
 * for the voice read-layer's message-content path (`hive:messages`): a message
 * body can quote a key, paste a token, or echo a credential, so every body and
 * subject is run through this before it crosses IPC. The renderer holds ZERO
 * redaction policy — it only ever receives the already-cleaned string.
 *
 * Deliberately CONSERVATIVE: it matches known credential SHAPES (provider key
 * prefixes, JWTs, PEM private keys, bearer tokens) and sensitive key=value /
 * key: value assignments, then replaces the secret with `[redacted]`. It does
 * NOT blanket-redact on entropy, so operator-meaningful content the briefing
 * needs — git SHAs, agent ids, file paths, ordinary prose — survives intact.
 * Over-redaction (e.g. a non-secret `apikey:openai` ref) is acceptable; leaking
 * a real secret is not.
 *
 * LOCKSTEP: the regex battery below is mirrored character-identically in
 * test/voice-messages.test.cjs (a .cjs test cannot import this TS module). If
 * you change a pattern here, mirror it there — the test is what PROVES a
 * secret-shaped value is stripped.
 */
export function redactSecrets(text: unknown): string {
  if (typeof text !== 'string' || !text) return typeof text === 'string' ? text : '';
  let s = text;
  // 1. PEM private-key blocks (RSA/EC/OPENSSH/PGP — header through footer).
  s = s.replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g, '[redacted]');
  // 2. JSON Web Tokens — three base64url segments separated by dots.
  s = s.replace(/\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g, '[redacted]');
  // 3. Known credential prefixes: OpenAI/Anthropic (sk-, sk-ant-), Slack
  //    (xoxb/xoxp/xoxa/xoxr/xoxs-, xapp-), GitHub (ghp_/gho_/ghu_/ghs_/ghr_,
  //    github_pat_), AWS access-key ids (AKIA…), Google API keys (AIza…).
  s = s.replace(
    /(?:sk-(?:ant-)?[A-Za-z0-9_-]{16,}|xox[bpaors]-[A-Za-z0-9-]{10,}|xapp-[A-Za-z0-9-]{10,}|gh[posru]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|AIza[A-Za-z0-9_-]{20,})/g,
    '[redacted]'
  );
  // 4. Bearer tokens — keep the label, drop the credential.
  s = s.replace(/\b(bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [redacted]');
  // 5. Sensitive key = value / key: value — keep the key name, drop the value.
  //    An optional namespace prefix (aws_, gcp_, …) is folded into the captured
  //    key so a LABELED secret survives the \b boundary: `aws_secret_access_key`
  //    is all word chars, so a bare `\b(secret)\b` never sees it. Listing
  //    secret_access_key / private_key alone is not enough — the prefix run is
  //    what lets `aws_secret_access_key=…` (no AKIA shape on the value) redact.
  s = s.replace(
    /\b((?:[a-z0-9]+[_-])*(?:api[_-]?key|secret[_-]?access[_-]?key|secret|token|password|passwd|pwd|access[_-]?token|refresh[_-]?token|client[_-]?secret|signing[_-]?secret|webhook[_-]?secret|auth[_-]?token|bot[_-]?token|private[_-]?key))(\s*[:=]\s*)(["']?)[^\s"',}]{6,}\3/gi,
    (_m, k) => `${k}=[redacted]`
  );
  return s;
}

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

// ─── HiveManager ────────────────────────────────────────────────────────────

export class HiveManager {
  /**
   * @param getHome  Lazily resolve harnessHome so the hive follows config changes.
   * @param emit     Optional sink for renderer-facing events (set by the main
   *                 process to `webContents.send`). Used to animate routed
   *                 messages on the office floor; a no-op in tests/headless.
   */
  constructor(
    private getHome: () => string | null,
    private emit?: (channel: string, payload: unknown) => boolean | void
  ) {}

  private routerTimer: NodeJS.Timeout | null = null;

  /** The embedded OTLP collector's loopback URL, set by the main process once the
   *  collector is bound (telemetry.ts). null = telemetry off → no OTel env is
   *  injected at spawn (the transcript reconciler remains the cost source). */
  private _otelEndpoint: string | null = null;
  /** Point newly-spawned agents at the live telemetry collector. Call after the
   *  collector starts; only affects spawns made afterwards. */
  setOtelEndpoint(url: string | null): void {
    this._otelEndpoint = url;
  }
  /** The collector URL agents are pointed at, or null when telemetry is off. */
  otelEndpoint(): string | null {
    return this._otelEndpoint;
  }

  // — paths —
  root(): string | null {
    const home = this.getHome();
    return home ? join(home, 'hive') : null;
  }
  enabled(): boolean {
    return this.root() !== null;
  }
  private agentDir(id: string): string {
    return join(this.root()!, 'agents', id);
  }
  /** IPC endpoint the cth-hook shim talks to (Phase 1 autonomy).
   *  On POSIX this is a Unix-domain socket file under the hive root. On Windows,
   *  Node's `net` IPC uses named pipes (a flat `\\.\pipe\` namespace, not the
   *  filesystem), so a raw file path fails to bind with EACCES — derive a stable,
   *  per-root pipe name instead. Both the server (`listen`) and the shim
   *  (`createConnection`) read this same value, so they stay in sync. */
  sockPath(): string | null {
    const root = this.root();
    if (!root) return null;
    if (process.platform === 'win32') {
      const id = createHash('sha1').update(root).digest('hex').slice(0, 12);
      return `\\\\.\\pipe\\hello-markx-${id}`;
    }
    return join(root, 'hooks.sock');
  }
  private shimPath(): string | null {
    const root = this.root();
    return root ? join(root, 'bin', 'cth-hook.cjs') : null;
  }
  /** The proxy-bridge sidecar (qwen). Pure-Node loopback reverse-proxy that
   *  observes a hookless CLI's LLM traffic and synthesizes the same HIVE_SOCK
   *  payloads the hook shims emit. Written in ensureHive alongside cth-hook.cjs. */
  private proxyShimPath(): string | null {
    const root = this.root();
    return root ? join(root, 'bin', 'hive-proxy.cjs') : null;
  }

  /**
   * The BUNDLED-NODE launcher: `<root>/bin/hive-node` (POSIX) / `hive-node.cmd`
   * (Windows). Every `.cjs` shim in the hive is executed through it.
   *
   * Why it exists: hooks are run by the agent CLI through a plain
   * `/bin/sh -c` with a bare `PATH=/usr/bin:/bin:/usr/sbin:/sbin`. A user whose
   * node comes from nvm (PATH set only by an interactive login shell) has NO node
   * there, so a hook written as `node "<shim>"` exits **127 — command not found**
   * and every payload is silently lost: no live status, no Stop→inbox drain, no
   * session ids. Electron's own binary IS a full Node runtime under
   * `ELECTRON_RUN_AS_NODE=1`, and it is guaranteed present (it is us).
   *
   * A wrapper SCRIPT rather than an inline `ELECTRON_RUN_AS_NODE=1 "<exe>" …`
   * prefix because that prefix is POSIX-sh syntax — it is a hard error under
   * cmd.exe, which is what runs hook commands on Windows. The wrapper also gives
   * agents a `$HIVE_NODE` they can invoke directly (running the Electron binary
   * WITHOUT the env var would launch a second app window, not a script).
   *
   * Rewritten on every bootstrap, so an app update/move re-bakes execPath.
   */
  private nodeLauncherPath(): string | null {
    const root = this.root();
    if (!root) return null;
    return join(root, 'bin', process.platform === 'win32' ? 'hive-node.cmd' : 'hive-node');
  }

  /** Write the launcher described above. Best-effort: on failure callers fall
   *  back to bare `node`, i.e. exactly the pre-fix behavior. */
  private writeNodeLauncher(): void {
    const p = this.nodeLauncherPath();
    if (!p) return;
    try {
      if (process.platform === 'win32') {
        writeFileSync(p, `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${process.execPath}" %*\r\n`, 'utf8');
      } else {
        writeFileSync(p, `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${process.execPath}" "$@"\n`, 'utf8');
        chmodSync(p, 0o755);
      }
    } catch (e) {
      console.error('[hive] writeNodeLauncher failed:', e);
    }
  }

  /** The launcher path if it is actually on disk, else null (→ callers fall back
   *  to bare `node`, i.e. exactly the pre-fix behavior — never worse than before). */
  private nodeLauncher(): string | null {
    const p = this.nodeLauncherPath();
    return p && existsSync(p) ? p : null;
  }

  /** The ABSOLUTE bundled-node command to BAKE into any text an agent is expected
   *  to run (`<launcher> <script> …`), falling back to bare `node`.
   *
   *  Exactly the value of the agent's `HIVE_NODE` env var — but agent-facing text
   *  must never spell it as `$HIVE_NODE`: that is POSIX shell syntax. A Windows
   *  agent runs its commands through cmd.exe/PowerShell, where `$HIVE_NODE`
   *  expands to NOTHING (cmd) or to an undefined variable (PowerShell), so every
   *  such instruction is dead on arrival there. The absolute path is correct on
   *  every platform and needs no expansion at all. */
  nodeCommand(): string {
    return this.nodeLauncher() ?? 'node';
  }

  /**
   * `<root>/bin/runtime` — the same bundled-node trick as `hive-node`, but the
   * wrapper is NAMED `node`, so anything that resolves `node` off PATH finds one.
   *
   * `hive-node` only covers commands WE generate. It does nothing for node that
   * the agent's own work needs at runtime: an MCP server declared as
   * `node ./server.js`, a provider CLI that shells out to node, a `.cjs` helper an
   * agent wrote itself. On a machine with no system node those all die with 127
   * exactly like the hooks did.
   *
   * This dir is APPENDED to the agent's PATH (see pty.spawn), never prepended: a
   * user who has their own node keeps their own version — we are strictly the
   * fallback. Prepending would silently swap every agent's node for Electron's
   * (20.18.1 as of Electron 32.3.3) underneath the user's own projects.
   *
   * NOTE: `node` only — deliberately no `npm`/`npx`. Electron bundles the Node
   * RUNTIME, not the npm CLI (which is ~12MB of JS we do not ship), so an `npm`
   * wrapper here could only be a stub that fails confusingly. A missing `npm` is
   * the honest signal; the install ladder (main/cliInstall.ts) detects it and
   * installs a REAL system Node — which brings npm with it. This shim is only the
   * last resort for when that install could not run (offline, or a platform with
   * no official installer).
   */
  runtimeBinDir(): string | null {
    const root = this.root();
    return root ? join(root, 'bin', 'runtime') : null;
  }

  /** Write the `node` shim described above. Best-effort: on failure the dir is
   *  simply absent from PATH and behavior is exactly as before. */
  private writeRuntimeShims(): void {
    const dir = this.runtimeBinDir();
    if (!dir) return;
    try {
      mkdirSync(dir, { recursive: true });
      if (process.platform === 'win32') {
        writeFileSync(
          join(dir, 'node.cmd'),
          `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${process.execPath}" %*\r\n`,
          'utf8'
        );
      } else {
        const p = join(dir, 'node');
        writeFileSync(p, `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${process.execPath}" "$@"\n`, 'utf8');
        chmodSync(p, 0o755);
      }
    } catch (e) {
      console.error('[hive] writeRuntimeShims failed:', e);
    }
  }

  /** Build a hook command string that runs `script` under the guaranteed node,
   *  DOUBLE-QUOTED (safe for paths with spaces). */
  private nodeRun(script: string, ...args: string[]): string {
    const launcher = this.nodeLauncher();
    return [launcher ? `"${launcher}"` : 'node', `"${script}"`, ...args].join(' ');
  }

  /** Same, but UNQUOTED — for the CLIs whose hook config mangles embedded quotes
   *  (agy on cmd.exe) or stores the command in a quote-sensitive literal (codex's
   *  single-quoted TOML). Safe because both the hive root and the launcher inside
   *  it are space-free by construction; this only preserves each installer's
   *  existing quoting convention while swapping `node` for the bundled runtime. */
  private nodeRunUnquoted(script: string, ...args: string[]): string {
    return [this.nodeLauncher() ?? 'node', script, ...args].join(' ');
  }

  /** One proxy sidecar per live proxy-tier agent, keyed by agentId. Spawned in
   *  ensureAgent, killed on PTY exit / removeAgent / app quit (index.ts) — so a
   *  dead agent never leaks an orphan loopback listener. */
  private proxyChildren = new Map<string, ChildProcess>();

  /** GATE-01 — how the hive mints a hook token for a PROXY SIDECAR.
   *
   *  The sidecar is not a PTY, so `PtyManager`'s per-spawn mint never sees it;
   *  it is a child of THIS class. Injected as callbacks the same way `pty.ts`
   *  takes them (`setHookTokenSource`), so hive.ts keeps no dependency on
   *  hooks.ts and no new wiring line is needed in the composition root:
   *  `HookServer`'s constructor already holds a `HiveManager` and registers
   *  itself here. Null until it does — a hive with no hook server mints no
   *  tokens, and its sidecars are inert rather than floor-wide-authenticated. */
  private hookTokenSource: {
    mint: (agentId: string) => string;
    revoke: (token: string) => void;
  } | null = null;

  /** agentId → the token its live sidecar is using, so it can be revoked when
   *  that sidecar exits. Mirrors pty.ts revoking token-exact on PTY exit. */
  private proxyTokens = new Map<string, string>();

  /** Called by `HookServer`'s constructor. See `hookTokenSource`. */
  setHookTokenSource(mint: (agentId: string) => string, revoke: (token: string) => void): void {
    this.hookTokenSource = { mint, revoke };
  }

  /** One fresh token for one sidecar spawn. Empty string when no hook server is
   *  wired: the sidecar then sends `sock_token: ''`, `authorized()` drops it and
   *  the tier is visibly dead-hooked — which is the correct failure. NEVER falls
   *  back to `process.env`; that floor-wide secret is what GATE-01 deleted. */
  private mintProxyToken(agentId: string): string {
    this.revokeProxyToken(agentId);
    const token = this.hookTokenSource?.mint(agentId) ?? '';
    if (token) this.proxyTokens.set(agentId, token);
    return token;
  }

  /** Revoke token-exact, never by agent: a sidecar restart is stop()+start()
   *  under the same id, and revoking by agent could kill the live replacement's
   *  token (the same race pty.ts documents). */
  private revokeProxyToken(agentId: string): void {
    const token = this.proxyTokens.get(agentId);
    if (!token) return;
    this.proxyTokens.delete(agentId);
    try { this.hookTokenSource?.revoke(token); } catch { /* teardown is best-effort */ }
  }

  // — bootstrap —

  /** Create the hive skeleton + git repo if missing. Idempotent. */
  ensureHive(): void {
    const root = this.root();
    if (!root) return;
    mkdirSync(join(root, 'agents'), { recursive: true });

    // Refreshed on every bootstrap, exactly like COMMANDS.md below. It used to be
    // write-once, so every existing floor was frozen on the protocol of the day it
    // was created — a new rule (the task CLI, reply deadlines, review) would only
    // ever reach a brand-new install. It is harness-owned prose with nothing
    // user-authored in it, so rewriting loses nothing.
    this.writeIfChanged(join(root, 'PROTOCOL.md'), PROTOCOL_MD);

    const registry = join(root, 'registry.json');
    if (!existsSync(registry)) {
      this.writeJson(registry, { godId: null, agents: {} } as Registry);
    }
    const board = join(root, 'board.md');
    if (!existsSync(board)) {
      writeFileSync(board, '# Hive board\n\n_Shared plans live here. The god agent is the scribe._\n', 'utf8');
    }
    const tasks = join(root, 'tasks.json');
    if (!existsSync(tasks)) this.writeJson(tasks, { tasks: [] });
    const log = join(root, 'log.jsonl');
    if (!existsSync(log)) writeFileSync(log, '', 'utf8');

    // The Claude Code command reference Michael consults (refreshed each bootstrap
    // so it tracks the bundled list).
    this.writeIfChanged(join(root, 'COMMANDS.md'), COMMANDS_MD);

    // Keep the churny/ephemeral live files out of the hive git repo. Anything
    // append-only or regenerated belongs here: a TRACKED file of that shape
    // stores a fresh copy of its WHOLE self in every hive commit, and the hive
    // commits constantly (this is the cost-ledger pathology — see untrackIgnored,
    // which drops the copies already in the index for everything listed here).
    const gitignore = join(root, '.gitignore');
    const want = [
      'fleet.json', 'hooks.sock', 'cost-ledger.jsonl', '.DS_Store',
      // Append-only event log + its one rotated generation.
      'log.jsonl', 'log.jsonl.1',
      // reflect.ts copies EVERY agent's memory.md in here on every condense
      // attempt, successful or not.
      'backups/',
      // atomicWriteJson's staging files. Transient, but a crash mid-write leaves
      // one behind and `git add -A` would commit the corpse.
      '*.tmp-*'
    ];
    let lines: string[] = [];
    if (existsSync(gitignore)) { try { lines = readFileSync(gitignore, 'utf8').split('\n'); } catch { lines = []; } }
    const missing = want.filter((w) => !lines.includes(w));
    if (missing.length) writeFileSync(gitignore, [...lines.filter(Boolean), ...missing].join('\n') + '\n', 'utf8');

    // The hook shim: a dumb pipe between a `claude` hook and our UDS. Refreshed
    // on every bootstrap so it tracks code changes.
    mkdirSync(join(root, 'bin'), { recursive: true });
    writeFileSync(this.shimPath()!, HOOK_SHIM, 'utf8');
    // The proxy-bridge sidecar for hookless CLIs (qwen). Same refresh policy.
    writeFileSync(this.proxyShimPath()!, PROXY_BRIDGE_SHIM, 'utf8');
    // The one-card ledger CLI (#17). Agents mutate tasks.json THROUGH this, under
    // compare-and-swap, instead of rewriting the whole file with their Write tool
    // and erasing whatever landed while they were composing.
    this.writeIfChanged(join(root, 'bin', 'task.cjs'), TASK_CLI);
    // The bundled-node launcher every shim above is invoked through — MUST be
    // written before any hook installer runs (they probe for it).
    this.writeNodeLauncher();
    // …and the PATH-visible `node` fallback for the agent's OWN subprocesses.
    this.writeRuntimeShims();

    if (!existsSync(join(root, '.git'))) {
      this.git(['init', '-q'], root);
      this.commit('hive: init');
    }
  }

  /** Write a generated file only when its content actually differs. ensureHive
   *  runs on every task write, and these are ~20 KB of identical bytes each time;
   *  a read+compare is the cheaper half of that, and it keeps a doc the agent may
   *  have open from being replaced under it for no reason. */
  private writeIfChanged(path: string, content: string): void {
    try { if (readFileSync(path, 'utf8') === content) return; } catch { /* absent or unreadable → write */ }
    writeFileSync(path, content, 'utf8');
  }

  /** Validate an agent's cwd the way a spawn does — it must be an ABSOLUTE path
   *  that exists as a directory. Surfaced as `cwdValid` on the registry entry so
   *  the roster reliably exposes whether a worker's working directory is usable.
   *  Best-effort; never throws (a stat error degrades to invalid). */
  private cwdValidity(cwd: string | undefined): { valid: boolean; issue: string | null } {
    if (!cwd || typeof cwd !== 'string') return { valid: false, issue: 'missing' };
    // Defense-in-depth: a `~/…` cwd from an older registry entry (written before
    // ingestion-time expansion) would read as 'not-absolute' forever. Expand first
    // so the roster reports the truth about the directory the spawn would use.
    cwd = expandTilde(cwd);
    if (!isAbsolute(cwd)) return { valid: false, issue: 'not-absolute' };
    try {
      return statSync(cwd).isDirectory()
        ? { valid: true, issue: null }
        : { valid: false, issue: 'not-a-directory' };
    } catch {
      return { valid: false, issue: 'missing-dir' };
    }
  }

  /**
   * Ensure an agent's workspace + registry entry, returning the spawn injection
   * (provider-specific args + env) that makes the process hive-aware.
   */
  async ensureAgent(
    meta: AgentMeta,
    opts: {
      semanticMemory?: boolean;
      knowledgeGraph?: boolean;
      /** ABSOLUTE path to the Knowledge-Graph CLI (`knowledge.env().KG_CLI`), baked
       *  into the agent's prompt instead of a `$KG_CLI` shell reference — `$VAR` is
       *  POSIX-only and expands to nothing under cmd.exe/PowerShell, so the KG
       *  instructions were unusable on Windows. Optional: undefined degrades to the
       *  old env-var spelling. */
      kgCliPath?: string;
      theme?: 'light' | 'dark';
      /** Consent state for the default-MCP bundle (W3). Threaded from the live
       *  HarnessConfig by the caller; undefined → catalog defaults apply. */
      mcpDefaults?: { [id: string]: { enabled: boolean } };
      /** App-resources `skills/` source dir (W3). The bundled read-only skills are
       *  copied into the agent's `.claude/skills/` per spawn; undefined or missing
       *  is a no-op (tolerated until Kevin populates the resource dir). */
      skillsDir?: string;
      /** SANITIZED (`sanitizeResourceAttr`) label of the agent's pinned Claude
       *  account, appended to OTEL_RESOURCE_ATTRIBUTES as `claude.account=<v>` so
       *  the collector/panel can group usage per account. The label only — never
       *  the token. Undefined = /login account (attr omitted). */
      accountAttr?: string;
    } = {}
  ): Promise<SpawnInjection> {
    const root = this.root();
    if (!root) return { args: [], env: {} };
    this.ensureHive();

    const dir = this.agentDir(meta.id);
    mkdirSync(join(dir, 'inbox', '.done'), { recursive: true });
    mkdirSync(join(dir, 'outbox', '.sent'), { recursive: true });

    const identity = join(dir, 'identity.md');
    writeFileSync(identity, this.identityText(meta), 'utf8'); // refresh on each spawn

    // W3 — bundled read-only skills: refresh the agent's .claude/skills/ from the
    // app-resources skills/ dir on every spawn (same policy as identity.md), so an
    // agent always rides with the shipped safe skill set. Tolerant: a missing or
    // partial source dir is a no-op (Kevin populates the resource dir in lp-manifest).
    if (opts.skillsDir) this.copyBundledSkills(opts.skillsDir, join(dir, '.claude', 'skills'));

    const memory = join(dir, 'memory.md');
    if (!existsSync(memory)) {
      writeFileSync(memory, `# Memory — ${meta.name} (${meta.id})\n\n_Append durable facts, decisions, and context below._\n`, 'utf8');
    }
    ensureMineIgnore(dir); // keep settings.json / cursor / messages out of mempalace's index
    const cursor = join(dir, 'cursor.json');
    if (!existsSync(cursor)) this.writeJson(cursor, { lastProcessed: null });

    // upsert registry — spread the PRIOR entry first so a respawn preserves
    // fields the spawn `meta` doesn't carry, above all `sessionId`. Without this,
    // ensureAgent (which runs before the resume lookup in the pty:spawn handler)
    // would wipe the recorded session id, so `lastSession()` returns undefined and
    // `--resume` is never attached — i.e. every restart starts a fresh thread.
    const reg = this.registry();
    const prev = reg.agents[meta.id];
    // Validate the working directory at the source so a bad value is visible on
    // the roster (cwdValid) rather than silently spawning into a nonexistent dir.
    // Store the EXPANDED cwd, never the raw `~/…` the user typed — the registry is
    // read by hooks, the roster and the worker watcher, none of which run a shell.
    if (meta.cwd) meta = { ...meta, cwd: expandTilde(meta.cwd) };
    const cwd = this.cwdValidity(meta.cwd);
    reg.agents[meta.id] = {
      ...prev,
      ...meta,
      capabilities: meta.capabilities ?? [],
      role: meta.role ?? (meta.isGod ? 'orchestrator' : 'agent'),
      // The spawn meta is authoritative for the account PIN (id only — never a
      // token): set explicitly rather than relying on the spread, so un-pinning
      // an agent (meta.account undefined) clears the recorded pin instead of the
      // stale one surviving via `...prev`. JSON.stringify drops the undefined.
      account: meta.account,
      accountPolicy: meta.accountPolicy,
      status: 'idle',
      cwdValid: cwd.valid,
      // A (re)spawn always means a live terminal — clear any prior archived flag.
      archived: false,
      lastSeen: Date.now()
    };
    if (meta.isGod) reg.godId = meta.id;
    this.writeJson(join(root, 'registry.json'), reg);

    this.appendLog({ kind: 'spawn', agentId: meta.id, name: meta.name, isGod: !!meta.isGod });
    // Only logs on an invalid cwd (rare) — not a per-spawn line, so no log spam.
    if (!cwd.valid) {
      this.appendLog({ kind: 'cwd_invalid', agentId: meta.id, cwd: meta.cwd, issue: cwd.issue });
    }
    this.commit(`hive: register ${meta.id}`);

    const env: Record<string, string> = {
      AGENT_ID: meta.id,
      AGENT_NAME: meta.name,
      HIVE_ROOT: root,
      AGENT_DIR: dir
    };
    // The bundled-node launcher, so an agent can run the hive's .cjs helpers (KG
    // CLI, Slack reply helper) even when `node` is not on its PATH. Invoking the
    // Electron binary directly would open a second app window, so this must stay
    // the wrapper path and never process.execPath.
    //
    // Kept as an env var for agent CONVENIENCE and for anything that reads it
    // programmatically — but agent-facing TEXT no longer references it by name:
    // `$HIVE_NODE` is POSIX-only syntax and expands to nothing under cmd.exe /
    // PowerShell, so every such instruction was dead on a Windows floor. Commands
    // we write for an agent to run bake `nodeCommand()`'s absolute path instead.
    env.HIVE_NODE = this.nodeCommand();

    const claudeProvider = isClaudeProvider(meta.provider ?? 'claude');

    // Non-hive-aware providers (Antigravity's `agy`, OpenAI's `codex`, xAI's
    // `grok`) don't
    // understand Claude Code's flags (no `--append-system-prompt`, no telemetry,
    // no `--settings`). Instead: (1) the hive identity+protocol rides in as the
    // session's INITIAL prompt — the closest thing to `--append-system-prompt`
    // these CLIs offer (after the first turn the session continues normally); and
    // (2) lifecycle hooks are wired via the preset's `hookBridge` below. Together
    // that makes a Gemini/Codex worker a full hive citizen — live status +
    // Stop→inbox-drain — without Claude installed at all.
    //
    // How the prompt rides in differs by CLI:
    //  - agy takes it under a flag (`agy -i "<prompt>"`) → push [flag, prompt].
    //  - codex/grok take it POSITIONALLY (`codex|grok "<prompt>"`) → push the
    //    bare prompt as a trailing arg (node-pty passes argv literally, so it
    //    arrives as one positional argument after codex's own flags).
    if (!isHiveAwareProvider(meta.provider)) {
      const preset = providerPreset(meta.provider ?? 'claude');
      const flag = preset.initialPromptFlag;
      const prompt = this.injectedPrompt(meta, dir, root, opts.semanticMemory ?? false, opts.knowledgeGraph ?? false, opts.kgCliPath);
      // agy, codex, and grok expose a Claude-style lifecycle-hook surface, so each
      // gets the SAME live status + Stop→inbox-drain Claude does — selected by the
      // preset's `hookBridge`. agy needs a translating shim (its hook stdin/stdout
      // shape differs from Claude's); codex reuses the Claude `cth-hook` shim
      // verbatim (its hook payload + response contract are already Claude-shaped)
      // and is isolated to a per-agent CODEX_HOME so the user's global ~/.codex is
      // never mutated. Both share the HIVE_SOCK wiring below.
      const preArgs: string[] = [];
      // Dispatch on the structured bridge descriptor (the foundation's `bridgeOf`
      // derives {kind:'hooks'} from the legacy `hookBridge` for agy/codex, and
      // returns the explicit {kind:'proxy'} for qwen). Two ways a hookless CLI
      // becomes a hive citizen:
      //   - 'hooks' → install a config-file hook shim (agy translator / codex verbatim).
      //   - 'proxy' → spawn a loopback reverse-proxy sidecar that observes the CLI's
      //               LLM traffic and SYNTHESIZES the same HIVE_SOCK payloads.
      const desc = bridgeOf(meta.provider);
      const sock = this.sockPath();
      if (desc && sock) {
        env.HIVE_SOCK = sock;
        try {
          if (desc.kind === 'hooks') {
            if (desc.shim === 'agy') this.installAgyHooks();
            else if (desc.shim === 'codex') {
              env.CODEX_HOME = this.installCodexHooks(dir);
              // Codex refuses to run hooks from a config dir without persisted
              // "hook trust" (normally an interactive gate). Our hooks.json is
              // hive-authored inside an isolated CODEX_HOME, so we bypass that gate
              // for this automated spawn — the flag's documented use ("automation
              // that already vets hook sources"). Without it the hooks silently
              // never fire. Must precede the positional prompt.
              preArgs.push('--dangerously-bypass-hook-trust');
            }
            else if (desc.shim === 'pi') {
              // Pi (earendil-works) has a rich pi.on(event) lifecycle. We drop a
              // bundled extension into a PER-AGENT PI_CODING_AGENT_DIR (so the user's
              // global ~/.pi is never touched) that posts cth-hook-shaped payloads to
              // HIVE_SOCK on tool_call/agent_end and auto-approves tools when the floor
              // is in auto mode. HIVE_AUTO_APPROVE (set in spawnAgentCore from
              // config.autoMode) gates the auto-allow — Pam guardrail #5.
              // LIVE-UNVERIFIED: the exact extension API surface needs BYOK keys to
              // prove; the renderer idle inbox-wake nudge is the guaranteed drain.
              env.PI_CODING_AGENT_DIR = this.installPiHooks(dir);
            }
            else if (desc.shim === 'opencode') {
              // OpenCode (anomalyco/opencode) has no Claude-shaped Stop hook, but its
              // plugin API exposes a real session.idle event (god Decision 1). We drop
              // a bundled plugin into a PER-AGENT OPENCODE config dir that posts
              // HIVE_SOCK payloads on tool.execute.before/after + session.idle — the
              // same Stop→drain semantics, provider-agnostic, no traffic interception.
              // LIVE-UNVERIFIED (plugin auto-load + session.idle firing); the renderer
              // idle inbox-wake nudge is the guaranteed drain fallback.
              env.OPENCODE_CONFIG_DIR = this.installOpenCodePlugin(dir);
            }
            else if (desc.shim === 'grok') this.installGrokHooks();
          } else if (desc.kind === 'proxy') {
            // Stable per-spawn session id, stamped on every synthesized payload so
            // recordSession (registry resume key) and the cost ledger persist.
            const spawnTs = String(Date.now());
            const sessionId = `proxy-${meta.id}-${createHash('sha1').update(root + meta.id + spawnTs).digest('hex').slice(0, 12)}`;
            env.HIVE_PROXY_SESSION = sessionId;
            // The CLI normally reads its upstream base URL from `baseUrlEnv`; capture
            // the user's configured value as the sidecar's UPSTREAM, then point the
            // CLI at the loopback proxy instead. Fall back to the cloud default if
            // the user hasn't set one.
            const upstream = process.env[desc.baseUrlEnv]
              || (desc.api === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1');
            const port = await this.startProxyBridge(meta.id, { sock, sessionId, api: desc.api, upstream });
            // Only redirect the CLI through the proxy if the sidecar actually bound a
            // port. On failure leave routing untouched → the CLI talks to its real
            // upstream directly (degraded: no synthesized hive events, but it still
            // runs). The degradation is logged, not hidden (1e).
            if (port > 0) {
              const loopback = `http://127.0.0.1:${port}`;
              if (meta.provider === 'crush') {
                // Crush has NO base-URL env override, so the generic env-rewrite is a
                // no-op for it. Route it instead via a per-agent CRUSH_GLOBAL_CONFIG
                // whose chosen provider's base_url points at the loopback proxy
                // (installCrushConfig — sibling of installCodexHooks). `upstream`
                // (captured above from the inert sentinel env or cloud default) is the
                // proxy's real target. Per-agent CRUSH_GLOBAL_DATA isolates session
                // state from the user's global ~/.config/crush.
                const crush = this.installCrushConfig(dir, loopback, desc.api);
                env.CRUSH_GLOBAL_CONFIG = crush.config;
                env.CRUSH_GLOBAL_DATA = crush.data;
              } else {
                env[desc.baseUrlEnv] = loopback;
              }
            }
            else console.error(`[hive] proxy bridge for ${meta.id} did not bind — spawning without hive events`);
          }
        } catch (e) { console.error(`[hive] install ${desc.kind} bridge failed:`, e); }
      }
      // Inject the protocol text whichever way the CLI accepts it.
      // type-into-tui (Crush): the bare TUI reads a positional as a Cobra subcommand
      // → `Unknown command`. So DROP the positional and hand the protocol back as
      // seedPrompt; the renderer types it into the TUI after boot (ondev-b).
      if (preset.seedDelivery === 'type-into-tui') return { args: [...preArgs], env, seedPrompt: prompt };
      // If a provider somehow exposes neither a flag nor a positional prompt, spawn bare.
      if (flag) return { args: [...preArgs, flag, prompt], env };
      if (preset.positionalInitialPrompt) return { args: [...preArgs, prompt], env };
      return { args: preArgs, env };
    }

    // Stage 7A — first-party Claude Code telemetry → the embedded loopback OTLP
    // collector (telemetry.ts). Pure env, no --settings change. Only injected
    // for Claude Code once the collector is up (otelEndpoint set), so telemetry-
    // off installs and non-Claude providers spawn exactly as before.
    if (claudeProvider && this._otelEndpoint) {
      env.CLAUDE_CODE_ENABLE_TELEMETRY = '1';
      env.OTEL_METRICS_EXPORTER = 'otlp';
      env.OTEL_LOGS_EXPORTER = 'otlp';
      env.OTEL_EXPORTER_OTLP_PROTOCOL = 'http/json';
      env.OTEL_EXPORTER_OTLP_ENDPOINT = this._otelEndpoint;
      env.OTEL_METRIC_EXPORT_INTERVAL = '5000'; // 5s — near-live without spamming
      env.OTEL_LOGS_EXPORT_INTERVAL = '2000';
      // `claude.account` = the SANITIZED pool-account label (never the token, and
      // sanitized so a label can't smuggle `,`/`=` into the attr list). Omitted
      // for /login-account agents so their resource attrs are byte-identical to
      // pre-pool builds.
      env.OTEL_RESOURCE_ATTRIBUTES = `agent.id=${meta.id},agent.name=${meta.name}`
        + (opts.accountAttr ? `,claude.account=${opts.accountAttr}` : '');
    }
    const args: string[] = [];
    if (!claudeProvider) return { args, env };

    args.push('--append-system-prompt', this.injectedPrompt(meta, dir, root, opts.semanticMemory ?? false, opts.knowledgeGraph ?? false, opts.kgCliPath));

    // Phase 1 — autonomy: attach lifecycle hooks via --settings (no edits to the
    // user's repo) so the agent reports activity and drains its inbox on Stop.
    const sock = this.sockPath();
    const shim = this.shimPath();
    if (sock && shim) {
      env.HIVE_SOCK = sock;
      const settingsPath = join(dir, 'settings.json');
      this.writeJson(settingsPath, this.hookSettings(shim, meta.cwd, opts.mcpDefaults, opts.theme));
      args.push('--settings', settingsPath);
    }
    return { args, env };
  }

  /**
   * Flip an agent's archived flag and persist the registry. Closing a terminal
   * tab archives the agent (retained + flagged, NOT deleted); a (re)spawn clears
   * it. No-op if the agent isn't registered or the flag is already set the way
   * asked. Best-effort — never throws, so a dying PTY/kill handler can't crash.
   */
  setArchived(id: string, archived: boolean): void {
    const root = this.root();
    if (!root) return;
    try {
      const reg = this.registry();
      const agent = reg.agents[id];
      if (!agent || agent.archived === archived) return;
      agent.archived = archived;
      agent.lastSeen = Date.now();
      this.writeJson(join(root, 'registry.json'), reg);
      this.appendLog({ kind: 'archive', agentId: id, archived });
      this.commit(`hive: ${archived ? 'archive' : 'unarchive'} ${id}`);
    } catch { /* best-effort — never crash a lifecycle handler */ }
  }

  /**
   * Persist the agent's Claude Code session_id (Lane A #6.6a). Captured from hook
   * payloads; written only when it actually changes (a new session), so this is a
   * no-op on the vast majority of hook events. The id is the `--resume` key for
   * idempotent resume after a crash/restart AND the accounting/dedup key for cost
   * samples. Best-effort — never throws into a hook handler.
   */
  recordSession(agentId: string, sessionId: string): void {
    const root = this.root();
    if (!root || !sessionId) return;
    try {
      const reg = this.registry();
      const agent = reg.agents[agentId];
      if (!agent || agent.sessionId === sessionId) return; // unknown agent or unchanged → no write
      agent.sessionId = sessionId;
      agent.lastSeen = Date.now();
      this.writeJson(join(root, 'registry.json'), reg);
      this.appendLog({ kind: 'session', agentId, sessionId });
      this.commit(`hive: session ${agentId}`);
    } catch { /* best-effort — never crash a hook handler */ }
  }

  /** The last known session_id for an agent, or undefined. Used to build a
   *  `claude --resume <id>` spawn so a restarted agent resumes its thread. */
  lastSession(agentId: string): string | undefined {
    return this.registry().agents[agentId]?.sessionId;
  }

  /** Claude Code settings that route every relevant hook through the shim, plus
   *  (W3) the default MCP bundle merged into this PER-SESSION settings file. cwd
   *  scopes the filesystem/git servers; cfg (the consent map) gates which servers
   *  are written. Claude-only — this is invoked solely on the Claude spawn path. */
  private hookSettings(shim: string, cwd: string, cfg: McpDefaultsMap, theme?: 'light' | 'dark'): unknown {
    // Bundled node, NOT bare `node` — see nodeLauncherPath(). Claude runs each of
    // these through `sh -c` with a stripped PATH, where `node` is often absent.
    const cmd = this.nodeRun(shim);
    const entry = (matcher?: string) => ({
      ...(matcher ? { matcher } : {}),
      hooks: [{ type: 'command', command: cmd }]
    });
    const mcpServers = this.buildDefaultMcpServers(cwd, cfg);
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
  private buildDefaultMcpServers(
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

  /**
   * W3 — refresh an agent's bundled skills from the app-resources `skills/` dir.
   * Mirrors `identity.md`: overwritten every spawn so the shipped safe set tracks
   * the app. Best-effort and fully tolerant — a missing/empty source dir is a no-op
   * (Kevin populates the resource dir in lp-manifest), and any IO error is swallowed
   * so skill provisioning can never block a spawn.
   */
  private copyBundledSkills(srcDir: string, destDir: string): void {
    try {
      if (!existsSync(srcDir)) return;
      const copyTree = (from: string, to: string): void => {
        const entries = readdirSync(from, { withFileTypes: true });
        if (!entries.length) return;
        mkdirSync(to, { recursive: true });
        for (const ent of entries) {
          const s = join(from, ent.name);
          const d = join(to, ent.name);
          if (ent.isDirectory()) copyTree(s, d);
          else if (ent.isFile()) copyFileSync(s, d);
        }
      };
      copyTree(srcDir, destDir);
    } catch (e) { console.error('[hive] copyBundledSkills failed:', e); }
  }

  /**
   * W1 — start a proxy-bridge sidecar for a hookless proxy-tier agent (qwen).
   * Spawns `<root>/bin/hive-proxy.cjs` under Node, which binds a loopback port and
   * reports it back as a one-line `{"port":N}` on stdout. Resolves the bound port
   * (or 0 on failure, so the caller degrades gracefully without redirecting the
   * CLI). Idempotent: any prior sidecar for the agent is killed first, so a respawn
   * never leaks a listener. Tracked in `proxyChildren` for teardown.
   */
  private startProxyBridge(
    agentId: string,
    cfg: { sock: string; sessionId: string; api: 'openai' | 'anthropic'; upstream: string }
  ): Promise<number> {
    this.stopProxyBridge(agentId);
    const script = this.proxyShimPath();
    if (!script) return Promise.resolve(0);
    // GATE-01 — this sidecar's OWN token, minted through the same registry every
    // PTY spawn uses. Before this it inherited a floor-wide secret that
    // index.ts assigned into `process.env`; deleting that assignment is the
    // whole of GATE-01, and re-reading it here would restore the vulnerability
    // by a longer route. Empty when no hook server is wired — see mintProxyToken.
    const token = this.mintProxyToken(agentId);
    return new Promise<number>((resolve) => {
      let settled = false;
      const settle = (port: number): void => { if (!settled) { settled = true; resolve(port); } };
      let child: ChildProcess;
      try {
        child = spawn(process.execPath, [script], {
          env: {
            ...process.env,
            // Run the .cjs under Electron's bundled Node, not as a second app window.
            ELECTRON_RUN_AS_NODE: '1',
            HIVE_SOCK: cfg.sock,
            AGENT_ID: agentId,
            UPSTREAM_BASE_URL: cfg.upstream,
            HIVE_PROXY_SESSION: cfg.sessionId,
            HIVE_PROXY_API: cfg.api,
            // Last, so the `...process.env` spread above can never shadow it —
            // including with a stale floor-wide value left in this process.
            HIVE_SOCK_TOKEN: token
          },
          // Read the port line from stdout; never inherit stdio (the sidecar must
          // never write into the agent's terminal or leak request bodies to a log).
          stdio: ['ignore', 'pipe', 'ignore']
        });
      } catch (e) {
        console.error(`[hive] startProxyBridge spawn failed for ${agentId}:`, e);
        return settle(0);
      }
      this.proxyChildren.set(agentId, child);
      let buf = '';
      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (d: string) => {
        if (settled) return;
        buf += d;
        const nl = buf.indexOf('\n');
        if (nl === -1) return;
        try {
          const msg = JSON.parse(buf.slice(0, nl));
          if (typeof msg.port === 'number' && msg.port > 0) settle(msg.port);
          else settle(0);
        } catch { settle(0); }
      });
      child.on('error', () => settle(0));
      child.on('exit', () => {
        if (this.proxyChildren.get(agentId) === child) this.proxyChildren.delete(agentId);
        this.revokeProxyToken(agentId);
        settle(0); // never hang the spawn if the sidecar dies before reporting
      });
      // Hard ceiling: if the sidecar never reports a port, degrade rather than hang.
      setTimeout(() => settle(0), 4000).unref?.();
    });
  }

  /** Kill the proxy sidecar for an agent, if any. Idempotent; never throws. */
  stopProxyBridge(agentId: string): void {
    const child = this.proxyChildren.get(agentId);
    if (!child) return;
    this.proxyChildren.delete(agentId);
    this.revokeProxyToken(agentId);
    try { child.kill(); } catch { /* already gone */ }
  }

  /** Kill every live proxy sidecar (app quit). Best-effort. */
  stopAllProxyBridges(): void {
    for (const id of [...this.proxyChildren.keys()]) this.stopProxyBridge(id);
  }

  /**
   * Drain an agent's inbox for the Stop hook. Returns whether to block-to-continue
   * and the message text to feed back. Uses the per-agent cursor so a message is
   * surfaced exactly once (no infinite loop).
   */
  drainForStop(agentId: string): { block: boolean; reason?: string } {
    const dir = this.agentDir(agentId);
    if (!existsSync(dir)) return { block: false };
    const cursorPath = join(dir, 'cursor.json');
    const cursor = this.readJson<{ lastProcessed: string | null }>(cursorPath, { lastProcessed: null });
    const fresh = this.inbox(agentId)
      .filter((m) => !cursor.lastProcessed || m.id > cursor.lastProcessed)
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    if (fresh.length === 0) return { block: false };

    cursor.lastProcessed = fresh[fresh.length - 1].id;
    this.writeJson(cursorPath, cursor);
    this.appendLog({ kind: 'drain', agentId, count: fresh.length });

    const lines = fresh.map((m) => `- [from ${m.from}, ${m.act}] ${m.subject}: ${m.body}`).join('\n');
    const reason = [
      `You have ${fresh.length} new hive message(s) in your inbox. Address them before finishing:`,
      lines,
      // Native separators (join, not string-concatenated `/`) so a Windows agent is
      // handed a path its own shell/tools accept, not `C:\…\agents\god/inbox/`.
      `Open the files in ${join(dir, 'inbox')} for full detail, act on each, then move handled ones to ${join(dir, 'inbox', '.done')}. Reply via your outbox if a message requires it.`
    ].join('\n');
    return { block: true, reason };
  }

  // — agent-facing text —

  private identityText(meta: AgentMeta): string {
    const caps = (meta.capabilities ?? []).join(', ') || '—';
    return [
      `# ${meta.name} (${meta.id})`,
      '',
      `- Role: ${meta.role ?? (meta.isGod ? 'orchestrator (god)' : 'agent')}`,
      `- Capabilities: ${caps}`,
      `- Working directory: ${meta.cwd}`,
      meta.isGod ? '- You are the **god / orchestrator**. You run the floor — keep awareness of the whole team, delegate execution, and personally own only the important calls (decomposition, sign-offs, conflicts, integration), not the grunt work.' : '',
      meta.isGod ? '- Monitor the team with `fleet.json` (live per-agent status/tokens/cost/breaker) and `registry.json`; full command reference in `COMMANDS.md`. `claude agents` does NOT list your hive siblings.' : '',
      ''
    ].filter(Boolean).join('\n');
  }

  /**
   * The system-prompt prefix injected into every spawn via --append-system-prompt.
   *
   * 🔒 PROMPT-CACHE INVARIANT — keep this prefix VOLATILE-FREE. It interpolates
   * only values stable for an agent's whole lifetime (name, id, dir, root,
   * semanticMemory). Do NOT add dates, UUIDs, counters, board/registry state, or
   * any `Date.now()`-derived text here: a prefix that changes per spawn defeats
   * Anthropic's prompt cache (re-priming the whole system prompt every turn).
   * Volatile context belongs on the live channels — the inbox (hive messages) and
   * the PTY — never baked into this prefix. (Lane A #6.1.)
   *
   * 🪟 NO SHELL SYNTAX. Every path and command here is written the way the AGENT
   * will actually type it, on the platform it is running on. That rules out two
   * habits that were silently Windows-only breakage:
   *  - `$VAR` — POSIX-only. Under cmd.exe `$HIVE_NODE`/`$KG_CLI` expand to nothing
   *    and under PowerShell to an undefined variable, so those instructions were
   *    dead on every Windows floor. Bake the ABSOLUTE resolved path instead: it is
   *    platform-independent, needs no expansion, and stays prompt-cache-stable.
   *  - `'…' + '/inbox/'` — string-concatenating separators told a Windows agent to
   *    read `C:\Users\x\hive\agents\god/inbox/`. Use join() so the agent's own
   *    tooling gets a path it can pass straight to its shell.
   */
  private injectedPrompt(
    meta: AgentMeta,
    dir: string,
    root: string,
    semanticMemory: boolean,
    knowledgeGraph: boolean,
    kgCliPath?: string
  ): string {
    // Native-separator path helpers — see the 🪟 note above.
    const inDir = (...parts: string[]): string => join(dir, ...parts);
    const inRoot = (...parts: string[]): string => join(root, ...parts);
    // The mempalace binary is BAKED as an absolute path, for exactly the reason
    // the KG CLI below is: the agent was told to type a bare `mempalace`, which
    // resolves against the PTY's PATH — not the set of places memoryBin() looks.
    // A GUI-launched app rarely has the uv/brew/pip shim dir on PATH, so the
    // green "semantic memory READY" dot meant nothing for the command the agent
    // was actually instructed to run. Prompt-cache-safe: one fixed path for the
    // life of an install (memoryBin() is probed once per process and cached), no
    // more volatile than kgCliPath. Falls back to the bare command when the CLI
    // isn't installed — i.e. never worse than before.
    const mem = semanticMemory ? memoryBin() ?? 'mempalace' : '';
    const memoryLine = semanticMemory
      // The palace location is named, not spelled as `$MEMPALACE_PALACE_PATH`:
      // `mempalace` reads that env var itself, and the POSIX `$` form was noise
      // (or an empty expansion) for a Windows agent that tried to use it literally.
      ? `Semantic memory: the whole hive shares a searchable MemPalace at the path in your MEMPALACE_PALACE_PATH environment variable. To recall relevant past knowledge across the team, run \`"${mem}" search "<query>"\`; run \`"${mem}" wake-up\` at the start of a task for a memory digest. (That is the absolute path to the mempalace CLI — use it instead of a bare \`mempalace\`, which may not be on your PATH.) Your notes in memory.md are mined into the palace automatically — write durable facts there.`
      : '';
    // Enterprise Knowledge Graph (opt-in). Volatile-free: the bundled-node launcher
    // and the KG CLI are both fixed absolute paths for an install, so baking them
    // keeps the prefix prompt-cache-stable while making the command runnable in
    // cmd.exe/PowerShell as well as a POSIX shell.
    const hiveNode = this.nodeCommand();
    const kgCli = kgCliPath || (process.platform === 'win32' ? '%KG_CLI%' : '$KG_CLI');
    const knowledgeLine = knowledgeGraph
      ? `Enterprise knowledge: this organisation has a private Knowledge Graph of its own documents, policies, and business context. When a task needs that context — company-specific facts, house style, internal processes — query it instead of guessing: run \`"${hiveNode}" "${kgCli}" search "<query>"\` for ranked passages, \`"${hiveNode}" "${kgCli}" list\` to see what is available, and \`"${hiveNode}" "${kgCli}" get <id>\` for a full document. (That first path is the harness's bundled Node — use it instead of bare \`node\`, which may not be on your PATH.)`
      : '';
    const godLine = meta.isGod
      ? 'You are the GOD / ORCHESTRATOR of this hive — your job is to ORCHESTRATE, not to implement: maintain live situational awareness and delegate the work. (1) AWARENESS — always know what is going on: keep an accurate picture of every agent (active vs archived/idle), the task board, and all in-flight work; drain your inbox continually and triage every other agent\'s requests, answering clarifications so the team runs autonomously. (2) DELEGATE — decompose work and fan it out to the hive agents via their inboxes (route messages and assign owners; do not do their jobs); do NOT take on grunt implementation yourself. Stay aware of who is already on the floor and delegate OPPORTUNISTICALLY: BEFORE you spawn anything, CHECK THE LIVE ROSTER (active agents in registry.json + their state in fleet.json) and prefer routing to an EXISTING agent that fits — above all when the request names one ("ask Pam to…", "have Jim…"), route to that agent instead of reflexively creating a new one. Reuse an idle or already-running agent whose role matches; only spawn a fresh agent when no existing one is a sensible fit, and say that you checked. One capable owner beats a duplicate. (3) OWN ONLY THE IMPORTANT, high-leverage things — task decomposition, dispatch decisions, sign-offs, conflict resolution, branch integration, and final QA — and remain the sole scribe of board.md. You are otherwise fully autonomous — there is NO separate approval queue. For the genuinely critical (destructive actions, spending real money, scope changes, unresolvable conflicts), ask the human directly in your own session and let the tool-permission prompt gate the action; the human approves natively, including remotely from their phone via /remote-control. Keep the team unblocked. When you DISPATCH a task, write it as a 4-part contract so the agent can run autonomously: (1) OBJECTIVE — the concrete goal; (2) OUTPUT — the expected deliverable/format; (3) TOOLS — what to use or avoid, and any references to read instead of re-deriving; (4) BOUNDARIES — scope limits + the definition of done. Pass references (file paths, message ids, board sections), not pasted content — keep dispatches short.'
        + ` MONITOR the floor by reading ${inRoot('fleet.json')} (live per-agent tokens, cost, status, last tool, breaker level, inbox backlog) and ${inRoot('registry.json')} — note that running 'claude agents' will NOT list your hive's sibling agents. A full Claude Code command reference is at ${inRoot('COMMANDS.md')} (slash commands act ONLY on your own session; CLI commands run in your shell and can target the fleet). You periodically receive scheduler / "Heartbeat" standup requests — on each, review every agent via fleet.json, re-engage anyone stalled, over-budget, or breaker-armed, and keep board.md and tasks.json accurate. NEVER edit tasks.json with your Write tool — it has several concurrent writers (you, the kanban UI, inbound webhooks and Slack), so writing back a copy you read a minute ago ERASES whatever landed in between, including answers the human just gave. Mutate ONE card at a time with \`"${hiveNode}" "${inRoot('bin', 'task.cjs')}" {add|patch|claim|done}\`, which compare-and-swaps on the ledger revision (full usage in PROTOCOL.md). ALWAYS set each task's "assignee" to the worker's agent id the moment you dispatch it, and NEVER clear it on status changes — a done card must still say who did the work (the human reads the board by who-did-what). HUMAN FEEDBACK is first-class in the ledger: when a task can only proceed with the human's input — a QUESTION to answer OR an ACTION only the human can perform (create an account, approve a purchase, provide credentials/screenshots, test on their device) — run \`task.cjs patch <id> --q "<the ask>"\`, which appends to the card's "humanQA" history and blocks it (phrase actions as clear to-dos; every past entry is kept — the history documents the card's decisions). The harness surfaces open questions on the office floor's ASK ME board; the human's answer lands in the same entry ("a") AND arrives as an inbox message to you — read it, act on it, and unblock the card so work continues. Do NOT park human questions in separate files (no HumanQuestion.md) and never sit waiting on the human in your own session. Steward the token budget.`
      : meta.isAssistant
      ? 'You are Michael\'s PREP ASSISTANT. You will be handed short, possibly vague instructions (each begins with "ENRICH TASK:"). For each one: (1) figure out which project it concerns and cd into the most relevant repo — you start in Michael\'s home directory; (2) gather concrete context READ-ONLY (exact file paths, current state, relevant code, conventions, active branch, gotchas) — NEVER modify, create, or delete files; (3) rewrite the instruction into ONE clear, self-contained prompt that Michael can execute autonomously, preserving the user\'s original intent without inventing scope. Then deliver it: write ONE message JSON into your outbox with "to":"god", "act":"request", a short subject, and the finished prompt as the body. Do NOT perform the task yourself — your only output is the improved prompt sent to Michael.'
      : 'For anything ambiguous, cross-cutting, or needing sign-off, address a message to "god".';
    const guardrailsLine = 'Guardrails: a circuit breaker watches the floor — a "Circuit breaker: steer/constrain" message means you are looping or overspending, so STOP repeating, summarize what you tried, and follow it. Be token-frugal (a floor-wide or per-agent token budget can pause you). The shared plan has two parts: board.md (freeform; god is the sole scribe) and tasks.json (structured kanban — todo/doing/blocked/done).';
    const slackLine = meta.isGod
      ? 'SLACK REPLIES: When composing a Slack reply (or writing the `result` field of a Slack-origin kanban card), you MUST: (1) directly address what the user asked — never a bare "done"; (2) include the relevant specifics, outcome, and details; (3) format for Slack mrkdwn — open with a short *bold* headline, use bullet points for multiple items, wrap code/paths in `backtick` blocks, keep it concise (no walls of text). When finishing a Slack-origin task, always write a complete, user-facing, well-formatted `result` on the kanban card — the system posts it verbatim to Slack as the done reply.'
      : `SLACK REPLIES: If god dispatches you a task that came from Slack, it will include an exact \`"${hiveNode}" "<helper>" --channel … --thread … --text "…"\` reply command — when you finish, run it VERBATIM to post your result back to that thread yourself. The reply must be SUBSTANTIVE Slack mrkdwn (a short *bold* headline + the actual outcome/specifics/links), NEVER a bare "done".`;
    return [
      `You are "${meta.name}" (${meta.id}), an autonomous agent in a collaborating hive of Claude agents.`,
      `Your private workspace is ${dir}. The shared hive is ${root}. Full protocol: ${inRoot('PROTOCOL.md')}.`,
      '',
      'HIVE PROTOCOL — follow it every task:',
      `1. At the START of a task, read ${inDir('memory.md')} and EVERY file in ${inDir('inbox')} (messages other agents sent you). After handling an inbox message, move its file into ${inDir('inbox', '.done')}.`,
      `2. Record durable facts, decisions, and context by appending to ${inDir('memory.md')}.`,
      `3. To ask another agent for something or share information, write ONE message JSON into ${inDir('outbox')} (schema in PROTOCOL.md). NEVER write into another agent's folder — the orchestrator delivers your outbox.`,
      '4. At the END of a task, append what you learned to memory.md so future-you remembers.',
      guardrailsLine,
      memoryLine,
      knowledgeLine,
      godLine,
      slackLine,
      `Env vars available to you: AGENT_ID, AGENT_NAME, HIVE_ROOT, AGENT_DIR.`
    ].filter(Boolean).join('\n');
  }

  // — messaging —

  /** Normalize a partial message into a full HiveMessage. */
  private normalize(partial: Partial<HiveMessage>, from: string): HiveMessage {
    const act = (partial.act ?? 'inform') as MessageAct;
    return {
      id: partial.id ?? `${stamp()}-${shortRand()}`,
      conversation: partial.conversation ?? `conv-${shortRand()}`,
      in_reply_to: partial.in_reply_to ?? null,
      from: partial.from ?? from,
      to: partial.to ?? 'god',
      act,
      subject: partial.subject ?? '',
      body: partial.body ?? '',
      hops: typeof partial.hops === 'number' ? partial.hops : 0,
      requires_reply: partial.requires_reply ?? ['request', 'query', 'propose'].includes(act),
      needs_human: partial.needs_human ?? false,
      created_at: partial.created_at ?? new Date().toISOString()
    };
  }

  /** Atomically deliver a message into a recipient agent's inbox. Returns FALSE
   *  when the recipient has no inbox on disk — an id that was never registered
   *  here. The caller must not report such a message as sent: routeMessage's
   *  guards all pass for an unknown id (canReceiveInbox(undefined) falls back to
   *  the claude preset → true), so the drop was silent while the log said
   *  "message" and the floor flew an envelope. */
  private deliver(msg: HiveMessage, toId: string): boolean {
    const inbox = join(this.agentDir(toId), 'inbox');
    if (!existsSync(inbox)) return false;
    this.atomicWriteJson(join(inbox, `${msg.id}.json`), msg);
    return true;
  }

  /** Inject a message directly (used by the orchestrator / UI / tests). */
  send(partial: Partial<HiveMessage>, from = 'system'): HiveMessage {
    const msg = this.normalize(partial, from);
    this.routeMessage(msg);
    this.commit(`hive: msg ${msg.from}→${msg.to} (${msg.act})`);
    return msg;
  }

  private routeMessage(msg: HiveMessage): void {
    const reg = this.registry();
    const godId = reg.godId ?? 'god';
    if (msg.hops > HOP_CAP) {
      // Loop guard. This used to DROP the message — but HIVE.md promises
      // escalation, and a silent drop is the worst of both: the two agents stop
      // ping-ponging AND neither they nor anyone else learns the thread died. So
      // hand it to god, who owns conflicts, and stop routing it. Delivered
      // DIRECTLY rather than re-routed, so the escalation cannot itself loop, and
      // with requires_reply cleared so it never enters the deadline sweep.
      // deliver() returning false means god has no workspace to write into — say
      // "dropped", never "escalated", when that is what actually happened (the
      // whole point of that return value; see its doc comment).
      const escalated = this.deliver({
        ...msg,
        to: godId,
        requires_reply: false,
        subject: `[hop-cap — this thread bounced ${msg.hops} times between "${msg.from}" and "${msg.to}"; break the loop] ${msg.subject}`
      }, godId);
      this.appendLog({
        kind: escalated ? 'escalate' : 'drop',
        reason: 'hop-cap', from: msg.from, to: msg.to, id: msg.id, hops: msg.hops
      });
      return;
    }
    // The hive has no separate human-approval queue — approvals are native to
    // each agent's Claude Code session (and approvable remotely). A message aimed
    // at "human" is handled by the god/orchestrator, the human's proxy here.
    const resolveTo = (to: string): string => (to === 'human' || to === 'god' ? godId : to);
    const targets = msg.to === 'broadcast'
      // The roster for fan-out is the ACTIVE registry: skip the send-only prep
      // assistant, any archived agent (closed tab), and providers that can't
      // expose safe-idle lifecycle state (hookless custom commands), so mail never
      // piles into a dead inbox. Claude, Codex and Antigravity are included; their
      // hooks let the renderer wake them only after a safe idle boundary.
      ? Object.keys(reg.agents).filter((a) =>
          a !== msg.from
          && !reg.agents[a]?.isAssistant
          && !reg.agents[a]?.archived
          && canReceiveInbox(reg.agents[a]?.provider))
      // Never deliver to self — guards a god → "human" message looping back to god.
      : [resolveTo(msg.to)].filter((t) => t !== msg.from);
    for (const t of targets) {
      // The send-only prep assistant must never be a delivery target: it doesn't
      // drain an inbox, so direct mail to it would rot unread (observed live: a
      // task brief plus the follow-up reprimand about the unread inbox, both
      // unread for hours). Bounce such mail to god instead, so the sender's intent
      // surfaces immediately and nothing is silently lost.
      if (reg.agents[t]?.isAssistant) {
        this.deliver({
          ...msg,
          to: godId,
          subject: `[bounced — "${t}" is the send-only prep assistant; route work to a real agent] ${msg.subject}`
        }, godId);
        continue;
      }
      // A provider without safe-idle lifecycle state (a hookless custom command)
      // would let direct mail rot unread. Claude and bridged Antigravity/Codex
      // receive directly into inbox/ for guarded renderer delivery. Otherwise try
      // a terminal work-order handoff to its REPL (#53);
      // if the renderer is unavailable, bounce to god to relay. God is exempt
      // (the bounce target).
      if (t !== godId && !canReceiveInbox(reg.agents[t]?.provider)) {
        if (!this.emitTerminalHandoff(msg, t)) {
          this.deliver({
            ...msg,
            to: godId,
            subject: `[undeliverable — "${t}" runs ${reg.agents[t]?.provider ?? 'a hookless CLI'} and the terminal handoff failed (renderer unavailable); relay this to it] ${msg.subject}`
          }, godId);
        }
        continue;
      }
      // 1d — proxy-tier providers (qwen) CAN receive inbox, but only via a
      // SYNTHESIZED Stop, which just advances the cursor — the sidecar observes the
      // CLI's stream and can't inject a drain reason back into its turn. So the real
      // mail rides the terminal work-order path verbatim, exactly like a hookless
      // provider; the synthesized Stop→drain keeps the cursor in step.
      const proxyDesc = bridgeOf(reg.agents[t]?.provider);
      if (t !== godId && proxyDesc?.kind === 'proxy' && proxyDesc.inboxDelivery === 'terminal') {
        if (!this.emitTerminalHandoff(msg, t)) {
          this.deliver({
            ...msg,
            to: godId,
            subject: `[undeliverable — "${t}" runs ${reg.agents[t]?.provider ?? 'a proxy-tier CLI'} and the terminal handoff failed (renderer unavailable); relay this to it] ${msg.subject}`
          }, godId);
        }
        continue;
      }
      // Last stop: an id nobody registered (a stale name remembered from a
      // pre-restart transcript, a typo). It has no workspace, so there is no
      // inbox to write into — bounce it to god with the full body, the same
      // shape as the three handoff bounces above, and record the drop so the
      // 'message' line below is never the only trace.
      if (!this.deliver(msg, t)) {
        this.appendLog({ kind: 'undeliverable', reason: 'unknown-agent', from: msg.from, to: t, id: msg.id });
        this.deliver({
          ...msg,
          to: godId,
          subject: `[undeliverable — "${t}" is not an agent on this floor (no workspace); it may have been removed] ${msg.subject}`
        }, godId);
      }
    }
    this.appendLog({ kind: 'message', from: msg.from, to: msg.to, act: msg.act, subject: msg.subject, id: msg.id });
    this.trackReplies(msg, targets);
    this.applyReviewVerdict(msg);
    this.emitMessage(msg, targets);
    // Main-process observer (e.g. the closing-time controller watching for the
    // team's ACKs and the god's COMPLETE). Best-effort, never breaks routing.
    try { this.routedObserver?.(msg, targets); } catch { /* observer error */ }
  }

  /** Observer invoked for EVERY routed message with its resolved targets.
   *  Used by main-process features that react to hive traffic (closing time). */
  private routedObserver: ((msg: HiveMessage, targets: string[]) => void) | null = null;
  setRoutedObserver(cb: ((msg: HiveMessage, targets: string[]) => void) | null): void {
    this.routedObserver = cb;
  }

  /** Tell the renderer a message was routed, with its resolved recipients, so
   *  the floor can fly an envelope from the sender to each one. Best-effort. */
  private emitMessage(msg: HiveMessage, targets: string[]): void {
    this.emit?.('hive:message', {
      id: msg.id,
      from: msg.from,
      to: msg.to,
      act: msg.act,
      subject: msg.subject,
      targets,
      // Coral-tints the floor envelope for a message the agent flagged for the
      // human (now routed to the god proxy). Cosmetic only — no queue behind it.
      needsHuman: msg.to === 'human'
    });
  }

  /** Non-Claude providers cannot drain hive inbox; hand direct mail to the
   *  renderer so it can queue a terminal work order for the target PTY. */
  private emitTerminalHandoff(msg: HiveMessage, targetId: string): boolean {
    const delivered = this.emit?.('hive:terminalHandoff', {
      id: msg.id,
      from: msg.from,
      to: targetId,
      act: msg.act,
      subject: msg.subject,
      body: msg.body,
      requiresReply: msg.requires_reply,
      createdAt: msg.created_at
    }) === true;
    this.appendLog({
      kind: 'terminal-handoff',
      from: msg.from,
      to: targetId,
      act: msg.act,
      subject: msg.subject,
      id: msg.id,
      delivered
    });
    return delivered;
  }

  // — router: drain outboxes → inboxes —

  /** Poll-based router. Cheap and robust vs fs.watch quirks on macOS. */
  startRouter(intervalMs = 1500): void {
    if (this.routerTimer || !this.enabled()) return;
    this.routerTimer = setInterval(() => {
      try { this.routeOnce(); } catch { /* keep the loop alive */ }
      // The protocol sweeps (#18) ride the router's own timer rather than the
      // optional heartbeat mission — the heartbeat ships DISABLED, and a reply
      // deadline that only fires when the user opted into a standup is not a
      // deadline. Self-throttled to SWEEP_INTERVAL_MS.
      try { this.sweep(); } catch { /* keep the loop alive */ }
    }, intervalMs);
  }
  stopRouter(): void {
    if (this.routerTimer) { clearInterval(this.routerTimer); this.routerTimer = null; }
  }

  routeOnce(): number {
    const root = this.root();
    if (!root) return 0;
    const agentsDir = join(root, 'agents');
    if (!existsSync(agentsDir)) return 0;
    let routed = 0;
    for (const id of readdirSync(agentsDir)) {
      const outbox = join(agentsDir, id, 'outbox');
      if (!existsSync(outbox)) continue;
      for (const f of readdirSync(outbox)) {
        if (!f.endsWith('.json')) continue;
        const full = join(outbox, f);
        try {
          const partial = JSON.parse(readFileSync(full, 'utf8')) as Partial<HiveMessage>;
          const msg = this.normalize(partial, id);
          msg.from = id; // sender is authoritative — the owning directory
          this.routeMessage(msg);
          renameSync(full, join(outbox, '.sent', f)); // archive, don't reprocess
          routed++;
        } catch {
          // malformed file — quarantine so we don't spin on it
          try { renameSync(full, join(outbox, '.sent', `bad-${f}`)); } catch { /* noop */ }
        }
      }
    }
    if (routed > 0) this.commit(`hive: routed ${routed} message(s)`);
    return routed;
  }

  // — protocol enforcement: reply deadlines + done review (#18) —

  /** `<root>/pending-replies.json` — the open `requires_reply` obligations.
   *  Keyed by message id; small, and deliberately ON DISK so a restart doesn't
   *  forget who owes whom an answer. */
  private pendingPath(): string | null {
    const root = this.root();
    return root ? join(root, 'pending-replies.json') : null;
  }
  private pendingReplies(): Record<string, PendingReply> {
    const p = this.pendingPath();
    return p ? this.readJson<Record<string, PendingReply>>(p, {}) : {};
  }
  private writePendingReplies(map: Record<string, PendingReply>): void {
    const p = this.pendingPath();
    if (p) this.writeJson(p, map);
  }

  /**
   * Open and close reply obligations as messages route past.
   *
   * A reply CLOSES an obligation two ways, because agents are inconsistent about
   * threading: an explicit `in_reply_to`, or any message from the party who owed
   * the answer inside the same `conversation`.
   *
   * ponytail: single-recipient messages only. A broadcast that "requires a reply"
   * would mean N obligations for one id, and nothing on the floor asks the whole
   * team to answer individually — add per-target keys if that ever becomes real.
   */
  private trackReplies(msg: HiveMessage, targets: string[]): void {
    const map = this.pendingReplies();
    let dirty = false;

    if (msg.in_reply_to && map[msg.in_reply_to]) { delete map[msg.in_reply_to]; dirty = true; }
    for (const [id, entry] of Object.entries(map)) {
      if (entry.to === msg.from && entry.conversation && entry.conversation === msg.conversation) {
        delete map[id];
        dirty = true;
      }
    }

    if (msg.requires_reply && targets.length === 1 && targets[0] !== msg.from) {
      map[msg.id] = {
        id: msg.id,
        from: msg.from,
        to: targets[0],
        subject: msg.subject,
        conversation: msg.conversation,
        due: Date.now() + REPLY_DEADLINE_MS,
        redelivered: false
      };
      dirty = true;
    }
    if (dirty) this.writePendingReplies(map);
  }

  /** Find a routed message's file wherever it now lives in an agent's mailbox. */
  private findMessage(agentId: string, msgId: string): HiveMessage | null {
    const base = this.agentDir(agentId);
    for (const dir of [join(base, 'inbox'), join(base, 'inbox', '.done')]) {
      const p = join(dir, `${msgId}.json`);
      if (!existsSync(p)) continue;
      try { return JSON.parse(readFileSync(p, 'utf8')) as HiveMessage; } catch { return null; }
    }
    return null;
  }

  /**
   * Re-deliver, then escalate, every `requires_reply` message nobody answered.
   *
   * First expiry: one re-delivery to the same recipient (a worker that was busy,
   * compacting, or restarted simply missed it). Second: the requester's ask goes
   * to god as `[unanswered]` and the obligation is closed — the point is that the
   * silence becomes VISIBLE to someone who can act, never that we retry forever.
   *
   * Returns how many obligations it acted on. Never throws (runs off a timer).
   */
  sweepUnansweredReplies(now = Date.now()): number {
    const map = this.pendingReplies();
    const godId = this.registry().godId ?? 'god';
    let acted = 0;
    for (const [id, entry] of Object.entries(map)) {
      if (entry.due > now) continue;
      const original = this.findMessage(entry.to, id);
      if (!entry.redelivered && original) {
        this.deliver({
          ...original,
          id: `${id}-reminder`,
          subject: `[reminder — unanswered for ${Math.round((now - (entry.due - REPLY_DEADLINE_MS)) / 60_000)}m] ${entry.subject}`
        }, entry.to);
        this.appendLog({ kind: 'reply-reminder', id, from: entry.from, to: entry.to });
        map[id] = { ...entry, redelivered: true, due: now + REPLY_DEADLINE_MS };
      } else {
        // No original on disk means the recipient's workspace is gone — escalate
        // immediately rather than spend a re-delivery round on a dead mailbox.
        const bounced = this.deliver(this.normalize({
          to: godId,
          act: 'inform',
          requires_reply: false,
          conversation: entry.conversation,
          subject: `[unanswered] ${entry.subject}`,
          body: `"${entry.to}" never answered "${entry.from}" (message ${id}). It has been re-delivered once and is still unanswered — chase it, reassign it, or answer it yourself.`
        }, 'system'), godId);
        this.appendLog({ kind: bounced ? 'unanswered' : 'drop', reason: 'unanswered', id, from: entry.from, to: entry.to });
        delete map[id];
      }
      acted++;
    }
    if (acted) this.writePendingReplies(map);
    return acted;
  }

  /** Card statuses as of the previous review sweep. Seeded (acting on nothing) on
   *  the first sweep so a ledger full of historic 'done' cards is never
   *  mass-reviewed at boot — only a card that reaches 'done' while we are watching
   *  gets a reviewer. A restart re-seeds; a card finished while the app was closed
   *  is not reviewed, which is the right trade against mailing the floor a hundred
   *  stale queries.
   *
   *  TWO different guards deliver that promise and they cover DIFFERENT sweeps —
   *  confusing them is how the storm gets shipped. `if (!previous) return 0` in
   *  sweepTaskReviews suppresses the FIRST sweep and only the first. The
   *  `previous.get(id) !== 'done'` mint test is what keeps every sweep from the
   *  SECOND onward quiet against the backlog: the boot seed already recorded every
   *  historic card as 'done', so the rule mints nothing for them.
   *
   *  `owesReview` shares this lifetime deliberately. It is process-local and is
   *  NEVER rebuilt from the persisted board at startup, because a rebuilt set would
   *  already hold every historic 'done' card — sweep 2 would mint nothing new, pass
   *  the obligation guard anyway, and mail one query per historic card. That is
   *  verbatim the storm this comment promises cannot happen. The price is that an
   *  obligation minted in a session which ends before any reviewer was free is
   *  lost, which is the same accepted trade as the card finished while the app was
   *  closed. (#18) */
  private lastTaskStatus: Map<string, string> | null = null;

  /** Task ids that owe a review — an obligation SET, not a second status field.
   *  The done-transition edge MINTS the obligation and only a successfully mailed
   *  query (the `send` AND the `patchTask`, both) clears it, so a card that
   *  flipped to 'done' while every other agent was busy stays in the set and is
   *  retried on a later sweep.
   *
   *  That retry is the whole of VERDICT-02. `if (!reviewer) continue` used to
   *  consume the transition permanently, because `this.lastTaskStatus = seen` is
   *  assigned ABOVE the loop: by the time the sweep found nobody free it had already
   *  recorded the card as 'done', so no later sweep saw a transition and the card
   *  was never reviewed again — silently.
   *
   *  Process-local by design; see lastTaskStatus above for why it must never be
   *  rebuilt from the board at startup. (#18) */
  private owesReview = new Set<string>();

  /** The least-loaded idle agent that can actually take mail, excluding `skip`
   *  (the assignee) and god. `canReceiveInbox` is the VERDICT-03 filter: a
   *  provider with no inbox-drain path (kimi, copilot, custom) is never selected,
   *  so on a mixed-engine floor a review is not routed into a black hole.
   *
   *  Null when nobody qualifies, and the sweep then leaves the card alone and tries
   *  again on a later sweep. That sentence was a FALSE claim in this comment until
   *  #18: the sweep recorded the card as 'done' before the loop ran, so a null
   *  reviewer consumed the transition and the card was never looked at again. It is
   *  true now, and true ONLY because `owesReview` holds the obligation across
   *  sweeps — do not remove the set and leave this comment standing. */
  private leastLoadedIdle(skip: string[]): string | null {
    const reg = this.registry();
    const godId = reg.godId ?? 'god';
    return Object.entries(reg.agents)
      .filter(([id, a]) => id !== godId && !skip.includes(id) && !a?.archived && !a?.isAssistant
        && !a?.isGod && a?.status === 'idle' && canReceiveInbox(a?.provider))
      .map(([id]) => ({ id, load: this.inboxBacklog(id) }))
      .sort((a, b) => a.load - b.load)[0]?.id ?? null;
  }

  /**
   * Ask a peer to check every card that just reached 'done'.
   *
   * `act:'done'` was terminal by design and nothing verified it, so "is this
   * actually done?" was always a human question. The reviewer is mailed a `query`
   * on conversation `review-<taskId>`; their verdict comes back through
   * applyReviewVerdict — `refuse` sends the card back to 'doing'.
   *
   * Reads the LEDGER rather than hooking writeTasks, so no writer is privileged:
   * whoever moved the card, the sweep sees the same durable state.
   *
   * ACCEPTED RESIDUAL (T-P03-07) — this is a SWEEP_INTERVAL_MS poll, not a change
   * feed. A card that is 'done' at one snapshot, reopened by a writer that does not
   * go through applyReviewVerdict (a god editing the board by hand), and 'done'
   * again before the next snapshot presents IDENTICAL durable state at both
   * observations, so it mints nothing and is not reviewed. No snapshot rule can see
   * a change that is undone before the next observation, and the alternative —
   * minting on "done with no open review" with no transition test — IS the boot
   * review-storm that lastTaskStatus forbids. The supported reopen path is
   * applyReviewVerdict's refuse branch, which re-mints the obligation directly.
   */
  sweepTaskReviews(): number {
    const tasks = this.ledger().tasks;
    const seen = new Map<string, string>(tasks.map((t) => [t.id, t.status]));
    // Bound the set by card lifetime (T-P03-05): an id no longer on the board —
    // archived or deleted — can never be reviewed, so drop it instead of carrying it
    // for the life of the process. Deliberately ABOVE the first-sweep return so an
    // obligation re-added by a refuse cannot outlive its card either.
    for (const id of this.owesReview) if (!seen.has(id)) this.owesReview.delete(id);
    const previous = this.lastTaskStatus;
    this.lastTaskStatus = seen;
    if (!previous) return 0; // first sweep: learn the floor, act on nothing

    let asked = 0;
    for (const task of tasks) {
      if (task.status !== 'done' || !task.assignee) continue;
      // "already has an OPEN review", not "has ever had a review object". After a
      // refusal the record survives with ok:false, and that card is precisely the one
      // a second look matters most for once it is re-done. The open case must still
      // be skipped or a card under review is re-queried every minute
      // (test/hive-protocol-v2.test.cjs:233).
      if (task.review && task.review.ok === undefined) continue;
      // Mint the obligation from the card's DURABLE state, not from a snapshot
      // MEMBERSHIP test. The deleted guard also demanded that the card ALREADY EXIST
      // in the previous snapshot (a bare `has()` membership test on the card id), which
      // silently dropped every card created AND flipped to 'done' inside one
      // SWEEP_INTERVAL_MS window: such a card is never observed in a non-done state
      // by any snapshot, so no obligation was ever minted for it and no amount of
      // retrying could recover it. That clause is DELETED — `previous.get(missingId)`
      // is undefined, which is !== 'done', so the absent-from-snapshot case mints
      // correctly here with no extra branch.
      //
      // Deleting it does not re-open the boot backlog storm, because two guards cover
      // two different sweeps: `if (!previous) return 0` above covers the FIRST sweep
      // (pinned by test/hive-protocol-v2.test.cjs:220), and the surviving `!== 'done'`
      // half below covers every sweep from the SECOND onward against the seeded
      // backlog (pinned by the quiet-second-sweep test in the same file — :220 alone
      // does NOT prove it, being green purely from the seed guard). Do not add a
      // second minting path. (#18)
      if (previous.get(task.id) !== 'done') this.owesReview.add(task.id);
      if (!this.owesReview.has(task.id)) continue;
      const reviewer = this.leastLoadedIdle([task.assignee]);
      // Nobody free. The obligation SURVIVES this `continue` — that is the fix: it
      // used to consume the transition edge and lose the review forever.
      if (!reviewer) continue;
      this.send({
        to: reviewer,
        act: 'query',
        conversation: `review-${task.id}`,
        subject: `[review] ${task.title}`,
        body: [
          `"${task.assignee}" marked task ${task.id} ("${task.title}") DONE. Check it before it counts as finished.`,
          task.description ? `Objective: ${task.description}` : '',
          `Reported result: ${task.result ?? '(none written)'}`,
          `Reply with act:"agree" if it holds up, or act:"refuse" with what is missing — which sends the card back to "doing". Carry conversation "review-${task.id}" either way.`
        ].filter(Boolean).join('\n')
      }, 'system');
      this.patchTask(task.id, { review: { by: reviewer, askedAt: new Date().toISOString() } });
      // Cleared only now, after BOTH the send and the patch succeeded. A throw from
      // either leaves the obligation standing for the next sweep.
      this.owesReview.delete(task.id);
      asked++;
    }
    return asked;
  }

  /** Apply a reviewer's verdict: `refuse` reopens the card, `agree` signs it off.
   *  Keyed off the `review-<taskId>` conversation the query carried. */
  private applyReviewVerdict(msg: HiveMessage): void {
    if (msg.act !== 'agree' && msg.act !== 'refuse') return;
    const taskId = /^review-(.+)$/.exec(msg.conversation ?? '')?.[1];
    if (!taskId) return;
    const task = this.ledger().tasks.find((t) => t.id === taskId);
    if (!task?.review || task.review.by !== msg.from) return;
    const ok = msg.act === 'agree';
    this.patchTask(taskId, {
      review: { ...task.review, ok },
      ...(ok ? {} : { status: 'doing' as const })
    });
    // A refusal is NOT terminal. When the assignee fixes the card and marks it
    // 'done' again the review record still carries ok:false, and the sweep's snapshot
    // may already hold the card as 'done', so neither the open-review skip nor the
    // transition mint would fire for it. Re-mint here: this is the supported reopen
    // path named in sweepTaskReviews's T-P03-07 note, and a refused-then-fixed card
    // is the one a second look matters most for. (#18)
    if (!ok) this.owesReview.add(taskId);
    this.appendLog({ kind: 'review', taskId, by: msg.from, ok });
  }

  /** Run both protocol sweeps. Throttled to SWEEP_INTERVAL_MS so the 1.5 s router
   *  tick can call it unconditionally. Best-effort — never throws into the loop. */
  private sweep(): void {
    const now = Date.now();
    if (now - this.lastSweep < SWEEP_INTERVAL_MS) return;
    this.lastSweep = now;
    try { this.sweepUnansweredReplies(now); } catch (e) { console.error('[hive] reply sweep failed:', e); }
    try { this.sweepTaskReviews(); } catch (e) { console.error('[hive] review sweep failed:', e); }
  }
  private lastSweep = 0;

  // — read helpers (for IPC / UI) —

  registry(): Registry {
    const root = this.root();
    if (!root) return { godId: null, agents: {} };
    return this.readJson<Registry>(join(root, 'registry.json'), { godId: null, agents: {} });
  }
  board(): string {
    const root = this.root();
    return root && existsSync(join(root, 'board.md')) ? readFileSync(join(root, 'board.md'), 'utf8') : '';
  }
  /**
   * The task ledger for READERS — the `hive:tasks` IPC channel, the renderer's
   * pollers, the Slack/webhook done-observers and the voice read layer.
   *
   * D-22 (#34, FLOOR-10): each row is widened with the card's meter — `tokens`
   * spent on it, its `budgetTokens` cap (null when it has none) and `pct`, the
   * ratio of the two (null when there is no cap, so a capless card renders as
   * "no cap" rather than as a NaN blank or an Infinity full bar). The renderer
   * already polls this channel every 5 s, so the meter needs no new IPC channel
   * and no preload change — `src/preload/index.ts` already types the return
   * `unknown`. The `hive:tasks` handler in index.ts stays a one-liner.
   *
   * The `rev` / `updatedAt` envelope is passed straight through: every mutation
   * path compare-and-swaps on `rev`.
   *
   * Reads the per-card accumulator DIRECTLY rather than calling `taskSpend()`
   * once per card — `taskSpend` re-reads tasks.json to find the cap on every
   * call, which on a channel this heavily polled would be one file read per card
   * per poll. Same accumulator, same card-lifetime bound RECORD-03 established;
   * no second cache is introduced here.
   */
  tasks(): unknown {
    const ledger = this.ledger();
    const byTask = this.costByTask ?? this.rescanCostLedger();
    return {
      ...ledger,
      tasks: ledger.tasks.map((t) => {
        const tokens = byTask.get(t.id)?.tokens ?? 0;
        const cap = typeof t.budgetTokens === 'number' && t.budgetTokens > 0 ? t.budgetTokens : null;
        return { ...t, tokens, budgetTokens: cap, pct: cap === null ? null : tokens / cap };
      })
    };
  }

  /** The task ledger with its revision — the typed read every mutation path goes
   *  through. Tolerates a pre-`rev` ledger (rev 0) and any partial/corrupt file. */
  private ledger(): TaskLedger {
    const root = this.root();
    const raw = root ? this.readJson<Partial<TaskLedger>>(join(root, 'tasks.json'), {}) : {};
    return {
      tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
      rev: typeof raw.rev === 'number' && raw.rev >= 0 ? raw.rev : 0,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : ''
    };
  }

  /**
   * Persist the task ledger to hive/tasks.json and commit it. Mirrors the
   * board/message persist pattern: write JSON, log the change, single-commit.
   *
   * `expectedRev` is the compare-and-swap: pass the `rev` you read and the write
   * is REFUSED (returns false) if anyone else wrote in between. Omitting it is a
   * blind whole-ledger overwrite — the exact move that erased a card the human
   * had just answered (#17) — so every mutation helper below supplies it, and
   * agents mutate one card at a time through `bin/task.cjs` instead.
   */
  writeTasks(tasks: HiveTask[], expectedRev?: number): boolean {
    const root = this.root();
    if (!root) return false;
    this.ensureHive();
    const current = this.ledger();
    if (typeof expectedRev === 'number' && expectedRev !== current.rev) {
      this.appendLog({ kind: 'tasks-conflict', expectedRev, rev: current.rev });
      return false;
    }
    const next: TaskLedger = { tasks: tasks.map(stripDerivedTaskFields), rev: current.rev + 1, updatedAt: new Date().toISOString() };
    this.writeJson(join(root, 'tasks.json'), next);
    this.appendLog({ kind: 'tasks', count: tasks.length, rev: next.rev });
    this.commit(`hive: tasks (${tasks.length})`);
    return true;
  }

  /**
   * Read-modify-write ONE card against the live ledger under compare-and-swap.
   * `fn` returns the next card array, or null to abort (nothing to do).
   *
   * Retries once: a single lost race is normal on a busy floor, two in a row is
   * real contention and the caller deserves to be told rather than have its write
   * silently win.
   *
   * ponytail: CAS + retry, not a lock. It closes the window this was written for
   * — a writer that reads the ledger, composes for 30 s, and writes it back — and
   * leaves a sub-millisecond read-rev→rename race. Upgrade path if that ever
   * bites: an O_EXCL lockfile at `<root>/tasks.lock`, shared with bin/task.cjs.
   */
  private mutateTasks(fn: (tasks: HiveTask[]) => HiveTask[] | null): boolean {
    for (let attempt = 0; attempt < 2; attempt++) {
      const ledger = this.ledger();
      const next = fn(ledger.tasks);
      if (next === null) return false;
      if (this.writeTasks(next, ledger.rev)) return true;
    }
    return false;
  }

  /** Append one card against the latest on-disk ledger. Renderer callers must
   *  use this instead of re-writing a collection they read before another
   *  source (webhook, Slack, god, voice) added work. Idempotent by task id. */
  addTask(task: HiveTask): boolean {
    return this.mutateTasks((tasks) =>
      tasks.some((current) => current?.id === task.id) ? null : [...tasks, task]);
  }

  /** Patch one card against the latest on-disk ledger, preserving unrelated
   *  cards and fields (notably webhook.tokenHash and Slack thread metadata). */
  patchTask(id: string, patch: Partial<Omit<HiveTask, 'id'>>): boolean {
    return this.mutateTasks((tasks) => {
      const index = tasks.findIndex((task) => task?.id === id);
      if (index < 0) return null;
      const next = tasks.slice();
      next[index] = { ...tasks[index], ...patch, id };
      return next;
    });
  }

  /** Delete only the named card from the latest on-disk ledger. */
  deleteTask(id: string): boolean {
    return this.mutateTasks((tasks) => {
      const next = tasks.filter((task) => task?.id !== id);
      return next.length === tasks.length ? null : next;
    });
  }
  memory(id: string): string {
    const p = join(this.agentDir(id), 'memory.md');
    return existsSync(p) ? readFileSync(p, 'utf8') : '';
  }
  /** Whether an agent has recorded NON-TRIVIAL memory — i.e. has appended real
   *  notes beyond the boilerplate header ensureAgent seeds. Lets the voice
   *  read-layer answer "what has the team remembered" and enumerate who has
   *  anything worth reading (every registered agent technically has a memory.md,
   *  but most of the floor's history lives in a handful of them). Cheap: reads a
   *  small markdown file; never throws. Works for ANY id, active OR archived. */
  hasMemory(id: string): boolean {
    const p = join(this.agentDir(id), 'memory.md');
    if (!existsSync(p)) return false;
    try {
      // A fresh seed is ~90 chars (one header line + the prompt). Anything
      // meaningfully longer means the agent appended durable facts.
      return readFileSync(p, 'utf8').trim().length > 200;
    } catch { return false; }
  }
  inbox(id: string): HiveMessage[] {
    return this.listMessages(join(this.agentDir(id), 'inbox'));
  }
  /** Read an agent's OUTBOX (messages it has authored/sent). Symmetric with
   *  inbox(); the router drains live outbox files into recipients' inboxes and
   *  archives the original under outbox/.sent, so a sent message survives there. */
  outbox(id: string): HiveMessage[] {
    return this.listMessages(join(this.agentDir(id), 'outbox'));
  }

  /**
   * Voice read-layer: recent message CONTENT (inbox + outbox bodies) for the
   * operator briefing, REDACTED main-side. This is the message-content half of
   * the voice query surface (the activity half is logTail()).
   *
   * Modes:
   *   - { id }                → the single message with that id, wherever it lives.
   *   - { agentId }           → recent messages in that agent's mailbox only.
   *   - {}                    → recent messages across the whole floor, newest first.
   * `limit` caps the list (default 12, max 40); `includeArchived` (default true)
   * also reads the handled subfolders (inbox/.done, outbox/.sent).
   *
   * SECURITY: every subject + body is passed through redactSecrets() here, in
   * main, so no secret and no raw body ever crosses IPC. Delivered messages exist
   * in both the sender's outbox/.sent and the recipient's inbox/.done; we dedup
   * by message id so each appears once.
   */
  voiceMessages(opts: { agentId?: string; id?: string; limit?: number; includeArchived?: boolean } = {}): VoiceMessage[] {
    const root = this.root();
    if (!root) return [];
    const agentsDir = join(root, 'agents');
    if (!existsSync(agentsDir)) return [];

    const wantId = typeof opts.id === 'string' ? opts.id.trim() : '';
    const onlyAgent = typeof opts.agentId === 'string' ? opts.agentId.trim() : '';
    const includeArchived = opts.includeArchived !== false; // default true

    let owners: string[];
    try {
      owners = onlyAgent
        ? [onlyAgent]
        : readdirSync(agentsDir).filter((id) => !id.startsWith('.') && existsSync(this.agentDir(id)));
    } catch {
      return [];
    }

    const seen = new Set<string>();
    const out: VoiceMessage[] = [];
    for (const owner of owners) {
      const base = this.agentDir(owner);
      const folders: Array<{ dir: string; direction: 'inbox' | 'outbox'; archived: boolean }> = [
        { dir: join(base, 'inbox'), direction: 'inbox', archived: false },
        { dir: join(base, 'outbox'), direction: 'outbox', archived: false }
      ];
      if (includeArchived) {
        folders.push({ dir: join(base, 'inbox', '.done'), direction: 'inbox', archived: true });
        folders.push({ dir: join(base, 'outbox', '.sent'), direction: 'outbox', archived: true });
      }
      for (const f of folders) {
        for (const m of this.listMessages(f.dir)) {
          if (!m || typeof m.id !== 'string' || seen.has(m.id)) continue;
          seen.add(m.id);
          if (wantId && m.id !== wantId) continue;
          out.push({
            id: m.id,
            conversation: m.conversation,
            from: m.from,
            to: m.to,
            act: m.act,
            subject: redactSecrets(m.subject),
            body: redactSecrets(m.body),
            requires_reply: !!m.requires_reply,
            direction: f.direction,
            owner,
            archived: f.archived,
            created_at: m.created_at
          });
        }
      }
    }

    // Newest first by ISO created_at (lexicographic == chronological for ISO-8601).
    out.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    if (wantId) return out.slice(0, 1);
    const lim = typeof opts.limit === 'number' && isFinite(opts.limit)
      ? Math.max(1, Math.min(40, Math.round(opts.limit)))
      : 12;
    return out.slice(0, lim);
  }
  /** Count undrained inbox messages for an agent (cheap — for the fleet snapshot). */
  inboxBacklog(id: string): number {
    const dir = join(this.agentDir(id), 'inbox');
    if (!existsSync(dir)) return 0;
    try { return readdirSync(dir).filter((f) => f.endsWith('.json')).length; } catch { return 0; }
  }
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
  private installAgyHooks(): void {
    const root = this.root();
    if (!root) return;
    const shim = join(root, 'bin', 'agy-hook.cjs');
    mkdirSync(join(root, 'bin'), { recursive: true });
    writeFileSync(shim, AGY_HOOK_SHIM, 'utf8');
    // Bundled node, not bare `node` — agy's hooks run with a stripped PATH too.
    const tool = (event: string) => ({
      matcher: '*',
      hooks: [{ type: 'command', command: this.nodeRunUnquoted(shim, event), timeout: 0 }]
    });
    const plain = (event: string) => ({
      hooks: [{ type: 'command', command: this.nodeRunUnquoted(shim, event), timeout: 0 }]
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
  private installCodexHooks(dir: string): string {
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
      const shim = this.shimPath();
      let config = existsSync(join(userHome, 'config.toml'))
        ? readFileSync(join(userHome, 'config.toml'), 'utf8') : '';
      if (shim) {
        const events = ['PreToolUse', 'PostToolUse', 'Stop', 'SubagentStop',
          'SessionStart', 'UserPromptSubmit', 'PreCompact', 'PostCompact'];
        config += '\n# --- hellomarkx-hive lifecycle hooks (auto-generated; do not edit) ---\n';
        for (const ev of events) {
          config += `\n[[hooks.${ev}]]\n[[hooks.${ev}.hooks]]\ntype = "command"\ncommand = '${this.nodeRunUnquoted(shim)}'\ntimeout = 30\n`;
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
  private installPiHooks(dir: string): string {
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
  private installOpenCodePlugin(dir: string): string {
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
  private installCrushConfig(dir: string, loopbackUrl: string, api: 'openai' | 'anthropic'): { config: string; data: string } {
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
  private installGrokHooks(): void {
    const root = this.root();
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
        hooks: [{ type: 'command', command: this.nodeRun(shim) }]
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

  /** Write the live fleet snapshot Michael reads (`fleet.json`, gitignored).
   *  Best-effort — called from a timer, must never throw. */
  writeFleetSnapshot(snapshot: unknown): void {
    const root = this.root();
    if (!root) return;
    try { writeFileSync(join(root, 'fleet.json'), JSON.stringify(snapshot, null, 2), 'utf8'); } catch { /* noop */ }
  }

  /** Is this agent the hive's god/orchestrator? */
  isGod(agentId: string): boolean {
    try {
      const reg = this.registry();
      return reg.godId === agentId || !!reg.agents[agentId]?.isGod;
    } catch { return false; }
  }

  /**
   * A compact, one-shot LIVE ROSTER line built from `fleet.json` — injected into
   * god's context as `additionalContext` on SessionStart and every
   * UserPromptSubmit (see HookServer).
   *
   * Why: fleet.json/registry.json are always fresh on disk (8s snapshot +
   * archiveOrphanedAgents on boot + PTY-exit archiving), but god's CONTEXT is not.
   * After an app restart god resumes a session whose transcript still describes
   * the OLD floor, and it will happily message agents that no longer exist. It is
   * told to read fleet.json, but "told to" is not "always knows" — so we push the
   * truth in on every turn instead. One line, so the cost is negligible.
   *
   * 🔒 …and it is therefore the ONE cache-safe home for anything volatile god
   * needs to know about the floor, including the per-engine capability line
   * (#44/#19). That line must NEVER go in injectedPrompt(): that prefix rides
   * --append-system-prompt and is deliberately volatile-free so Anthropic's
   * prompt cache holds across turns; a roster-derived sentence there would
   * re-prime the whole system prompt every time an agent's engine changed. Here it
   * costs one line on a channel that is already re-sent per prompt.
   *
   * Returns null when there is nothing to say (no hive, no snapshot, no agents),
   * so the hook stays a no-op rather than injecting noise.
   */
  rosterContext(): string | null {
    const root = this.root();
    if (!root) return null;
    try {
      const raw = readFileSync(join(root, 'fleet.json'), 'utf8');
      const snap = JSON.parse(raw) as {
        ts?: number;
        agents?: Array<{
          id: string; name?: string; role?: string; isGod?: boolean;
          breaker?: string; tokens?: number; usd?: number;
          lastTool?: string | null; lastActiveSecAgo?: number | null; inboxBacklog?: number;
        }>;
      };
      const agents = Array.isArray(snap.agents) ? snap.agents : [];
      if (!agents.length) return null;

      const ago = (s: number | null | undefined): string =>
        typeof s !== 'number' ? 'unknown'
          : s < 90 ? `${s}s ago`
            : s < 5400 ? `${Math.round(s / 60)}m ago`
              : `${Math.round(s / 3600)}h ago`;

      // Cap the list so a big floor can't crowd out the actual prompt. The
      // remainder is still counted, and fleet.json is one Read away.
      const MAX = 24;
      const shown = agents.slice(0, MAX);
      // The engine each agent runs on lives in registry.json, not the snapshot.
      // It rides HERE (#44) because this is the cache-safe path — see the note
      // above — and because god cannot delegate sensibly without it: a capability
      // an engine lacks is a dispatch that silently fails.
      const reg = this.registry();
      const engines = new Set<string>();
      const rows = shown.map((a) => {
        const engine = reg.agents[a.id]?.provider ?? 'claude';
        engines.add(engine);
        const bits = [a.role ?? 'agent', engine,
          typeof a.lastActiveSecAgo === 'number' ? `active ${ago(a.lastActiveSecAgo)}` : 'no activity yet'];
        if (a.tokens) bits.push(`${Math.round(a.tokens / 1000)}k tok`);
        if (a.usd) bits.push(`$${a.usd.toFixed(2)}`);
        if (a.inboxBacklog) bits.push(`inbox ${a.inboxBacklog}`);
        if (a.breaker && a.breaker !== 'ok' && a.breaker !== 'none') bits.push(`breaker ${a.breaker}`);
        if (a.isGod) bits.push('you');
        return `${a.id}${a.name ? ` "${a.name}"` : ''} (${bits.join(', ')})`;
      });
      const more = agents.length > shown.length ? ` +${agents.length - shown.length} more` : '';
      const age = typeof snap.ts === 'number' ? ago(Math.round((Date.now() - snap.ts) / 1000)) : 'unknown';

      // The capability legend, for the engines actually on this floor only. Empty
      // until the engine-cost cluster calls setEngineCapabilities() — an unset map
      // renders nothing, so the roster is byte-for-byte what it was.
      const legend = [...engines]
        .map((e) => (this.engineCapabilities[e] ? `${e} — ${this.engineCapabilities[e]}` : ''))
        .filter(Boolean)
        .join('; ');

      return `[LIVE ROSTER — auto-injected from ${join(root, 'fleet.json')}, snapshot ${age}] `
        + `${agents.length} ACTIVE agent(s): ${rows.join('; ')}.${more} `
        + (legend ? `Engine capabilities: ${legend}. ` : '')
        + 'This is the CURRENT floor and it SUPERSEDES any roster earlier in this conversation — '
        + 'agents you remember that are absent here have been archived or killed, so do not message them. '
        + 'Route work to someone on this list before spawning anyone new.';
    } catch { return null; }
  }

  /** Per-engine capability text for the roster line, keyed by provider id (#19).
   *  Owned by the engine-cost cluster, which knows what each engine can do; the
   *  hive only guarantees it lands on the CACHE-SAFE path (#44) — the roster,
   *  never the system-prompt prefix. Unset renders nothing. */
  private engineCapabilities: Record<string, string> = {};
  setEngineCapabilities(map: Record<string, string>): void {
    this.engineCapabilities = { ...map };
  }
  /** The last `n` log events. Reads only the last LOG_TAIL_BYTES of the file:
   *  this is called from IPC and the voice read-layer, and log.jsonl is an
   *  append-only file with a dozen writers, so slurping it whole to show 200
   *  lines was a growing per-call read. */
  logTail(n = 200): unknown[] {
    const root = this.root();
    if (!root) return [];
    const lines = this.tailLines(join(root, 'log.jsonl'), LOG_TAIL_BYTES);
    return lines.slice(-n).map((l) => { try { return JSON.parse(l); } catch { return { raw: l }; } });
  }

  /** The last `maxBytes` of an append-only file, as whole lines. Shared by
   *  logTail and taskSpend: both read a file with a dozen writers that only ever
   *  grows, and neither may slurp it whole to answer one query. */
  private tailLines(path: string, maxBytes: number): string[] {
    if (!existsSync(path)) return [];
    let text: string;
    try {
      const size = statSync(path).size;
      const start = Math.max(0, size - maxBytes);
      const buf = Buffer.alloc(size - start);
      const fd = openSync(path, 'r');
      try { readSync(fd, buf, 0, buf.length, start); } finally { closeSync(fd); }
      text = buf.toString('utf8');
      // A window that starts mid-file almost always starts mid-record; drop that
      // fragment rather than hand the caller a {raw:…} shard of one event.
      if (start > 0) text = text.slice(text.indexOf('\n') + 1);
    } catch { return []; }
    return text.trim().split('\n').filter(Boolean);
  }

  private listMessages(dir: string): HiveMessage[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => { try { return JSON.parse(readFileSync(join(dir, f), 'utf8')) as HiveMessage; } catch { return null; } })
      .filter((m): m is HiveMessage => m !== null);
  }

  // — log —

  /** Size of log.jsonl, tracked in-process so the rotation check is not a stat
   *  on every append (a dozen writers hit this path). -1 = not seeded yet. */
  private logBytes = -1;

  appendLog(event: Record<string, unknown>): void {
    const root = this.root();
    if (!root) return;
    const path = join(root, 'log.jsonl');
    const line = JSON.stringify({ ts: Date.now(), ...event }) + '\n';
    try {
      if (this.logBytes < 0) {
        try { this.logBytes = statSync(path).size; } catch { this.logBytes = 0; }
      }
      // Rotate, ONE generation deep. The log is append-only, has never been
      // rotated, and is read by logTail — an unbounded file is an unbounded read
      // and (until the ignore seed above) an unbounded repo. Renaming over the
      // previous generation keeps recent history without a retention policy.
      if (this.logBytes >= LOG_ROTATE_BYTES) {
        // A rotation that fails (a Windows file lock, say) must not also cost us
        // the event, so it gets its own catch and we append to the oversized file
        // regardless. The counter resets either way — a stuck rename should be
        // retried at the next window, not on every single append.
        try { renameSync(path, `${path}.1`); } catch { /* keep appending */ }
        this.logBytes = 0;
      }
      appendFileSync(path, line, 'utf8');
      this.logBytes += Buffer.byteLength(line);
    } catch { /* noop */ }
  }

  /**
   * Append one cost sample to the durable, append-only ledger at
   * `<root>/cost-ledger.jsonl` (Lane A #6.6d). This is the SOLE durable cost
   * store; its row is exactly the shape Kevin (#4) reserves for the cost_ledger
   * SQLite table, so migration is a mechanical INSERT…SELECT.
   *
   * 🔒 PII: persist ONLY the allowlisted AgentUsageSample — NEVER a raw OTel
   * record (those carry user.email / account / org / hashed-user-id). The sample
   * is PII-free by construction upstream (the provider's normalize step), so we
   * add no redaction here; we just must not widen what we write. The file lives
   * at the hive ROOT, so `mempalace mine` (which only scans per-agent dirs) never
   * ingests it — no palace noise, no MINE_IGNORE entry needed.
   *
   * Like appendLog: append to disk now (durable immediately), let it ride the
   * next natural commit. Best-effort — never throws into the beat.
   */
  appendCostLedger(sample: AgentUsageSample): void {
    const root = this.root();
    if (!root) return;
    // Fully snake_case so the row maps 1:1 onto Kevin's (#4) cost_ledger SQLite
    // columns (agent_id, session_id, ts, input, output, cache_read,
    // cache_creation, model, usd) — migration is a straight INSERT…SELECT.
    const row = {
      agent_id: sample.agentId,
      session_id: sample.sessionId,
      // #34 — WHICH CARD this spend belongs to. Without it the ledger could only
      // answer "what has this agent cost, ever", never "what did this card cost"
      // or "spend at most N on this one". Null when the agent has no card in
      // flight (idle chatter, the god orchestrating). The column is part of the
      // row shape breaker.ts enforces caps against; see taskSpend().
      task_id: this.activeTaskId(sample.agentId),
      ts: sample.ts,
      input: sample.input,
      output: sample.output,
      cache_read: sample.cacheRead,
      cache_creation: sample.cacheCreation,
      model: sample.model,
      usd: sample.usd
    };
    try { appendFileSync(join(root, 'cost-ledger.jsonl'), JSON.stringify(row) + '\n', 'utf8'); } catch { /* noop */ }
    // Keep the per-card accumulator current without re-reading the file. Only
    // when it has already been built — otherwise the first taskSpend() call
    // scans the whole ledger and would double-count anything applied here first.
    if (this.costByTask) this.applyCostRow(this.costByTask, this.costCumulative, row);
  }

  // ─── RECORD-03 / RECORD-04 — what one card has actually cost ────────────────
  //
  // THE ARITHMETIC, because getting it wrong is invisible until a budget is
  // enforced against it (#34, FLOOR-10):
  //
  // A ledger row is a CUMULATIVE snapshot of one (agent, session) at one beat —
  // `src/main/db.ts:44` and `src/main/telemetry.ts` both say so, and since
  // RECORD-04 there is exactly one appender, so it is now true of every row.
  // Spend "since the last beat" is therefore the DIFFERENCE between consecutive
  // snapshots of the same series, never the sum of the snapshots themselves
  // (summing over-counts roughly quadratically — that was the defect).
  //
  //   series key   = agent_id + session_id. A new session starts its own
  //                  accumulator at zero, so it starts a new series rather than
  //                  diffing against the previous session's much larger total.
  //   first row    = its OWN value. It has no predecessor and the series began
  //                  at zero, so the whole of it was spent after that zero. The
  //                  alternative (treat it as zero) silently loses every card
  //                  that starts and finishes inside one ~30 s beat window,
  //                  which is the same class of under-report RECORD-03 removes.
  //   later rows   = max(0, now - previous). CLAMPED, because
  //                  `telemetry.forget()` on a respawn resets the collector, so
  //                  the next snapshot can legitimately be SMALLER than the last
  //                  one; an unclamped diff would go negative and hand the card
  //                  a refund it never earned.
  //   attribution  = the delta lands on the CURRENT row's `task_id`. Rows with a
  //                  null task_id (idle chatter, the god) still advance the
  //                  series baseline — they must, or the next carded row would
  //                  bill their spend to the card — but they credit no card.
  //
  // Worked example, one agent, one session, card `t-1`:
  //   row 1 {input 10, output 5}  → no predecessor → t-1 += 15   (t-1 = 15)
  //   row 2 {input 14, output 6}  → 20 - 15 = 5    → t-1 += 5    (t-1 = 20)
  //   row 3 {input  1, output 0}  → 1 - 20 = -19   → clamped 0   (t-1 = 20)
  // The old code read 15 + 20 + 1 = 36 for the same three rows, through a 1 MB
  // tail that would have dropped row 1 entirely on a long card.

  /** taskId → spend so far, or null until the first full ledger scan builds it.
   *  This is what replaces RECORD-03's deleted 1 MB read window: one scan at
   *  first use (which, after a restart, is the rescan that stops a card in
   *  flight from silently resetting to zero), then incremental updates from
   *  `appendCostLedger`. Bounded by CARD LIFETIME — `pruneCostByTask` drops
   *  entries for cards that have left the board, since removing the tail
   *  removed the only bound this map now stands in for. */
  private costByTask: Map<string, { tokens: number; usd: number }> | null = null;
  /** The last cumulative snapshot seen per series (agent id + session id), which
   *  is what the next row is diffed against. */
  private costCumulative = new Map<string, { tokens: number; usd: number }>();

  /** Fold one ledger row into the accumulators. Shared by the startup scan and
   *  the incremental append so the two can never disagree. */
  private applyCostRow(
    byTask: Map<string, { tokens: number; usd: number }>,
    cumulative: Map<string, { tokens: number; usd: number }>,
    row: { agent_id?: string | null; session_id?: string | null; task_id?: string | null; input?: number; output?: number; usd?: number }
  ): void {
    const key = `${row.agent_id ?? ''}\u0000${row.session_id ?? ''}`;
    const now = { tokens: (row.input ?? 0) + (row.output ?? 0), usd: row.usd ?? 0 };
    const previous = cumulative.get(key);
    const delta = previous
      ? { tokens: Math.max(0, now.tokens - previous.tokens), usd: Math.max(0, now.usd - previous.usd) }
      : now;
    cumulative.set(key, now);
    const taskId = row.task_id;
    if (!taskId) return; // advanced the baseline, credits no card
    const acc = byTask.get(taskId) ?? { tokens: 0, usd: 0 };
    acc.tokens += delta.tokens;
    acc.usd += delta.usd;
    byTask.set(taskId, acc);
  }

  /** Rebuild both accumulators from the WHOLE ledger. Runs once per process, on
   *  the first `taskSpend()` — which after an app restart is what stops a card
   *  still in flight from reporting zero spend (T-P06-03). One scan of one
   *  append-only file at boot; if that ever measurably costs, `PersistStore`'s
   *  `cost_ledger` table answers it in one `SUM(...) GROUP BY task_id`. */
  private rescanCostLedger(): Map<string, { tokens: number; usd: number }> {
    const byTask = new Map<string, { tokens: number; usd: number }>();
    const cumulative = new Map<string, { tokens: number; usd: number }>();
    const root = this.root();
    if (root) {
      let raw = '';
      try { raw = readFileSync(join(root, 'cost-ledger.jsonl'), 'utf8'); } catch { raw = ''; }
      for (const line of raw.split('\n')) {
        if (!line) continue;
        try { this.applyCostRow(byTask, cumulative, JSON.parse(line)); } catch { /* skip a torn line */ }
      }
    }
    this.costCumulative = cumulative;
    this.costByTask = byTask;
    this.pruneCostByTask();
    return byTask;
  }

  /** Drop accumulator entries for cards that are no longer on the board. The
   *  map has no other bound now that the tail read is gone, and an archived or
   *  deleted card's entry would otherwise live as long as the process. */
  private pruneCostByTask(): void {
    const byTask = this.costByTask;
    if (!byTask) return;
    const live = new Set(this.ledger().tasks.map((t) => t.id));
    for (const id of [...byTask.keys()]) if (!live.has(id)) byTask.delete(id);
  }

  /** assignee → their in-flight card id, rebuilt at most once a beat.
   *  appendCostLedger runs per usage sample; re-reading tasks.json on each would
   *  turn cost accounting into a file read per token report. */
  private activeTaskCache: { at: number; map: Map<string, string> } | null = null;

  /** The card an agent is currently working — its first 'doing' card. Null when
   *  it has none. */
  private activeTaskId(agentId: string): string | null {
    const now = Date.now();
    if (!this.activeTaskCache || now - this.activeTaskCache.at > 5_000) {
      const map = new Map<string, string>();
      for (const t of this.ledger().tasks) {
        if (t?.status === 'doing' && t.assignee && !map.has(t.assignee)) map.set(t.assignee, t.id);
      }
      this.activeTaskCache = { at: now, map };
      // Cheapest honest place for the accumulator's lifetime bound: this rebuild
      // already reads the board, and it only runs while cost is actually flowing.
      this.pruneCostByTask();
    }
    return this.activeTaskCache.map.get(agentId) ?? null;
  }

  /**
   * What ONE card has cost so far, against the cap its dispatch set (#34).
   *
   * This is the read side of the per-task cap: `task_id` on the ledger rows makes
   * the spend attributable, `budgetTokens` on the card is the cap, and breaker.ts
   * (the engine-cost cluster's file) owns the enforcement decision.
   *
   * RECORD-03/RECORD-04: reads the per-card accumulator described above — every
   * row of the ledger, never a tail window, and clamped consecutive DIFFERENCES
   * between cumulative snapshots, never their sum.
   */
  taskSpend(taskId: string): { tokens: number; usd: number; budgetTokens: number | null; over: boolean } {
    const byTask = this.costByTask ?? this.rescanCostLedger();
    const { tokens, usd } = byTask.get(taskId) ?? { tokens: 0, usd: 0 };
    const cap = this.ledger().tasks.find((t) => t.id === taskId)?.budgetTokens;
    const budgetTokens = typeof cap === 'number' && cap > 0 ? cap : null;
    return { tokens, usd, budgetTokens, over: budgetTokens !== null && tokens > budgetTokens };
  }

  /**
   * FLOOR-10 (#34) — the assignee's in-flight card as a breaker budget, or null
   * when the agent has no card in flight or the card has no cap. ONE call, so
   * the breaker beat's edit in `src/main/index.ts` is a single line:
   * `budget: hive.budgetForAgent(id) ?? undefined`.
   *
   * The card is resolved through `activeTaskId()` — the SAME resolver
   * `appendCostLedger` stamps `task_id` with — so the rows a card's spend was
   * billed to and the card its cap is read from can never disagree.
   *
   * Null when `budgetTokens` is unset: no cap means no budget arm, never a
   * surprise trip.
   *
   * Null, too, for a card that has left the board — and that is load-bearing
   * rather than incidental. RECORD-03's accumulator is bounded by CARD LIFETIME
   * (`pruneCostByTask`), which is the memory bound that replaced the deleted
   * 1 MB tail window, so `taskSpend()` on an archived or deleted card answers
   * ZERO. `activeTaskId()` only ever names a card that is 'doing' on the live
   * board, so that zero can never reach the arm dressed as a live card sitting
   * comfortably under its cap — which would recover an agent that had just been
   * constrained, on a number that only means the card was archived.
   */
  budgetForAgent(agentId: string): { taskId: string; tokens: number; cap: number } | null {
    const taskId = this.activeTaskId(agentId);
    if (!taskId) return null;
    const { tokens, budgetTokens } = this.taskSpend(taskId);
    if (budgetTokens === null) return null;
    return { taskId, tokens, cap: budgetTokens };
  }

  // — json + atomic io —
  private readJson<T>(p: string, fallback: T): T {
    try { return JSON.parse(readFileSync(p, 'utf8')) as T; } catch { return fallback; }
  }
  /**
   * EVERY json the hive persists goes through the atomic write below — this used
   * to be a bare writeFileSync, and it is what persists registry.json and
   * tasks.json.
   *
   * A truncated write is not a loud failure here: readJson swallows the parse
   * error and hands back the fallback, so a crash (power loss, OOM kill) partway
   * through one of these silently resets the god id, every agent's
   * cwd/provider/session and the entire kanban — and the app boots into
   * onboarding as if the floor had never existed. tmp+rename costs one extra
   * file operation; the truncation window is worth more than that.
   */
  private writeJson(p: string, data: unknown): void {
    this.atomicWriteJson(p, data);
  }
  private atomicWriteJson(p: string, data: unknown): void {
    const tmp = `${p}.tmp-${shortRand()}`;
    writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    renameSync(tmp, p);
  }

  // — git (single committer: debounced, off the main thread, stale-lock recovery) —

  /** Blocking git. The ONLY caller left is `git init` in ensureHive — a one-shot
   *  at bootstrap on an empty directory. Everything on the commit path uses
   *  gitAsync; see commit() for why that matters. */
  private git(args: string[], cwd: string): { ok: boolean; out: string; err: string } {
    const res = spawnSync('git', ['-c', `core.hooksPath=${GIT_HOOKS_DISABLED}`, '-c', 'commit.gpgsign=false', '-c', 'user.name=Hive', '-c', 'user.email=hive@local', ...args], {
      cwd, encoding: 'utf8', timeout: 8000
    });
    return { ok: res.status === 0, out: res.stdout ?? '', err: res.stderr ?? '' };
  }

  /** Set while a git child WE spawned is alive, so clearStaleLock can never
   *  delete an index.lock that belongs to a live child of ours. */
  private gitInFlight = false;

  /** Same as {@link git}, but awaits the child instead of blocking the loop. */
  private gitAsync(args: string[], cwd: string): Promise<{ ok: boolean; out: string; err: string }> {
    return new Promise((resolve) => {
      let out = '';
      let err = '';
      this.gitInFlight = true;
      const done = (ok: boolean): void => { this.gitInFlight = false; resolve({ ok, out, err }); };
      try {
        const child = spawn(
          'git',
          ['-c', `core.hooksPath=${GIT_HOOKS_DISABLED}`, '-c', 'commit.gpgsign=false', '-c', 'user.name=Hive', '-c', 'user.email=hive@local', ...args],
          { cwd, timeout: GIT_TIMEOUT_MS }
        );
        child.stdout?.on('data', (d) => { out += d.toString(); });
        child.stderr?.on('data', (d) => { err += d.toString(); });
        child.on('error', (e) => { err += String(e); done(false); });
        child.on('close', (code) => done(code === 0));
      } catch (e) { err = String(e); done(false); }
    });
  }

  /** Has the one-time untrack pass run in this process yet? */
  private untrackedIgnored = false;

  /**
   * Stop versioning the churny files the ignore seed lists.
   *
   * `cost-ledger.jsonl`, `log.jsonl` and `backups/` are all append-only or
   * regenerated wholesale, so a repo that TRACKS them stores a fresh copy of the
   * whole thing in every hive commit — and the hive commits constantly. A
   * quarter-gigabyte ledger with a few thousand commits behind it is several
   * hundred gigabytes of blob that git has to walk, which is what turns a routine
   * `gc` into a multi-gigabyte `pack-objects` run. The ignore lines in ensureHive
   * keep NEW copies out; this drops the ones already in the index, because git
   * keeps recording a file it already tracks no matter what .gitignore says — so
   * the ignore line alone reads as a fix while the repo goes on growing.
   *
   * The files stay on disk; only their history is dropped.
   */
  private async untrackIgnored(root: string): Promise<void> {
    if (this.untrackedIgnored) return;
    this.untrackedIgnored = true;
    // Probe before mutating: `rm --cached` on a repo that never tracked any of
    // these would still rewrite the index on every launch, inside the retry path.
    const tracked = await this.gitAsync(['ls-files', '--', ...UNTRACK_PATHS], root);
    if (!tracked.ok || !tracked.out.trim()) return;
    await this.gitAsync(['rm', '--cached', '-r', '-q', '--ignore-unmatch', '--', ...UNTRACK_PATHS], root);
    console.warn('[hive] untracked churny files from the hive repo:', tracked.out.trim().split('\n').length, 'path(s)');
  }

  /** Trailing debounce timer for the next commit, and the messages folded into it. */
  private commitTimer: NodeJS.Timeout | null = null;
  private pendingCommits: string[] = [];
  /** Set for the whole flush, so two flushes can never interleave `add -A`. */
  private committing = false;

  /**
   * Commit all hive changes. Fire-and-forget: DEBOUNCED and never blocking.
   *
   * This used to run `git add -A` + `git commit` synchronously, with an 8 s
   * timeout, five attempts and an `Atomics.wait` backoff — all on the Electron
   * main thread, once per hive message, and also from the router tick,
   * writeTasks(), ensureAgent() and setArchived(). A repo whose index was locked
   * froze the supervisor for something like 80 seconds: no IPC, no PTY bytes
   * forwarded, hook shims timing out, the UI beachballed.
   *
   * Nothing is lost if the app quits with a commit pending — git here is history,
   * not storage. Every file was already written (atomically) before commit() was
   * called, and the next launch's `add -A` picks up whatever the timer did not.
   * That is also why the timer is unref'd: a pending commit must never be the
   * reason the process stays alive.
   */
  commit(message: string): void {
    const root = this.root();
    if (!root || !existsSync(join(root, '.git'))) return;
    this.pendingCommits.push(message);
    this.scheduleCommit(root);
  }

  private scheduleCommit(root: string): void {
    if (this.commitTimer) return;
    this.commitTimer = setTimeout(() => {
      this.commitTimer = null;
      void this.flushCommit(root);
    }, COMMIT_DEBOUNCE_MS);
    this.commitTimer.unref?.();
  }

  /** Fold the batched messages into one commit: the first as the subject, the
   *  full list as the body so a 5 s window's worth of history is still readable. */
  private drainCommitMessages(): { subject: string; body: string } {
    const msgs = this.pendingCommits;
    this.pendingCommits = [];
    const uniq = [...new Set(msgs)];
    const subject = uniq.length <= 1
      ? uniq[0] ?? 'hive: update'
      : `${uniq[0]} (+${uniq.length - 1} more)`;
    return { subject, body: uniq.length > 1 ? uniq.join('\n') : '' };
  }

  /**
   * True when a staged path's blob is BYTE-IDENTICAL to the constant this class
   * writes there — i.e. the harness authored it, not an agent.
   *
   * This exists because both hook shims embed the line
   * `payload.sock_token = process.env.HIVE_SOCK_TOKEN || '';` — source that
   * READS a token, which redactSecrets pattern 5 matches on sight. Without this
   * check every hive would unstage its own bootstrap on its very first commit,
   * the shims would stay untracked so the next `add -A` would re-stage them, and
   * the scrub would then shout on every commit forever. An alarm that fires
   * constantly on the harness's own files is one an operator learns to skip,
   * which costs more than it buys.
   *
   * It is byte-identity against a compiled-in constant, NOT a path allowlist:
   * an agent that edits a shim to smuggle a key changes the bytes and the scrub
   * fires on it like any other file. The comparison is against the INDEX blob
   * (`git show :path`), not the working file — the index is what is about to be
   * committed, and it is also the only form immune to core.autocrlf, which is
   * `true` by default on Git for Windows and would otherwise make every
   * comparison fail there and quietly restore the false positives.
   */
  private async harnessAuthored(root: string, rel: string): Promise<boolean> {
    const generated: Record<string, string | undefined> = {
      'bin/cth-hook.cjs': HOOK_SHIM,
      'bin/hive-proxy.cjs': PROXY_BRIDGE_SHIM
    };
    const want = generated[rel];
    if (want === undefined) return false;
    const blob = await this.gitAsync(['show', `:${rel}`], root);
    return blob.ok && blob.out === want;
  }

  /** Drop one path from the index, leaving it untouched on disk. `restore
   *  --staged` is the modern spelling and restores from HEAD — which is exactly
   *  why it needs the fallback: on a repo whose first commit has not landed yet
   *  HEAD is unborn, and it exits 128 `could not resolve HEAD` having unstaged
   *  NOTHING (measured). The hive's first commit stages the whole bootstrap, so
   *  that is precisely the window an agent-planted secret would ride in on. */
  private async unstagePath(root: string, rel: string): Promise<boolean> {
    const restored = await this.gitAsync(['restore', '--staged', '--', rel], root);
    if (restored.ok) return true;
    const removed = await this.gitAsync(['rm', '--cached', '-q', '--ignore-unmatch', '--', rel], root);
    return removed.ok;
  }

  /**
   * FLOOR-04 (#10, defect 5): scrub secret-shaped content out of the staged set,
   * between `git add -A` and `git commit`.
   *
   * WHY HERE AND NOWHERE ELSE. ADR-0004 makes this class the hive repo's single
   * committer, so flushCommit is the ONE place every hive write reaches git
   * through. A per-caller guard would have to be repeated at each of commit()'s
   * callers and would be missed by the next one added. A `.git/hooks/pre-commit`
   * would be both a second committer and unrunnable by construction, since the
   * hive deliberately suppresses hooks with core.hooksPath so an agent cannot
   * plant one (see git/gitAsync).
   *
   * WHY redactSecrets AND NOT A SECOND MATCHER. The project trusts exactly one
   * pattern set; the mail path already runs every subject and body through it.
   * Two matchers that disagree is worse than one imperfect matcher, because the
   * disagreement is silent — the commit path would accept what the mail path
   * redacts. This call site does not change the battery, which is under a
   * LOCKSTEP contract with test/voice-messages.test.cjs.
   *
   * WHAT IT DOES NOT CATCH — measured, not assumed, and pinned by a test in
   * test/hive-durability.test.cjs rather than promised here: credential shapes
   * with no pattern (`sk_live_…`, since pattern 3 wants `sk-` and not `sk_`),
   * bare high-entropy strings carrying neither a prefix nor a label, and JSON —
   * `"token": "…"` does NOT match pattern 5, which needs the `:`/`=` directly
   * after the key name and finds the closing quote in the way. Binary blobs
   * produce no `+` lines and are never scanned. This is defence in depth, not a
   * guarantee, and no doc may claim more of it.
   *
   * ADDED LINES ONLY. A removed line is content git already has, so flagging it
   * would mean unstaging a DELETION — which cannot unpublish anything and would
   * wedge the committer permanently on any repo that ever held a secret.
   *
   * @returns false ONLY when a secret is staged and could not be unstaged, the
   * single case where the caller must not commit. Every other failure returns
   * true and degrades loudly: a scrub that throws or halts would take the hive's
   * whole durability path down with it, which is a worse failure than the one it
   * prevents, and nothing is lost by committing late — see commit(), git here is
   * history and not storage.
   */
  private async scrubStagedSecrets(root: string): Promise<boolean> {
    const addedLines = (s: string): string =>
      s.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).join('\n');

    // 1. Bound the work before it exists as a string.
    const stat = await this.gitAsync(['diff', '--cached', '--numstat'], root);
    if (!stat.ok) {
      console.warn('[hive] FLOOR-04: could not read the staged diff — committing UNSCANNED:', stat.err.trim());
      this.appendLog({ kind: 'secret-scan-skipped', reason: 'diff-failed' });
      return true;
    }
    if (!stat.out.trim()) return true; // nothing staged — nothing to scan
    let changed = 0;
    for (const row of stat.out.split('\n')) {
      const [added, deleted] = row.split('\t');
      changed += (Number(added) || 0) + (Number(deleted) || 0); // '-' (binary) → 0
    }
    if (changed > SECRET_SCAN_MAX_LINES) {
      console.warn(`[hive] FLOOR-04: staged diff is ${changed} lines, over the ${SECRET_SCAN_MAX_LINES} scan cap — committing UNSCANNED`);
      this.appendLog({ kind: 'secret-scan-skipped', reason: 'diff-too-large', lines: changed });
      return true;
    }

    // 2. core.quotePath=false so a non-ASCII path comes back raw and can be
    //    handed straight back to `restore --staged`; -U0 drops context lines,
    //    which are unchanged content and so cannot be a NEW leak.
    const diff = await this.gitAsync(
      ['-c', 'core.quotePath=false', 'diff', '--cached', '--unified=0', '--no-color', '--no-ext-diff'],
      root
    );
    if (!diff.ok) {
      console.warn('[hive] FLOOR-04: could not read the staged diff — committing UNSCANNED:', diff.err.trim());
      this.appendLog({ kind: 'secret-scan-skipped', reason: 'diff-failed' });
      return true;
    }
    const text = diff.out.slice(0, SECRET_SCAN_MAX_BYTES);
    if (text.length < diff.out.length) {
      console.warn(`[hive] FLOOR-04: staged diff is ${diff.out.length} bytes — only the first ${SECRET_SCAN_MAX_BYTES} were scanned`);
      this.appendLog({ kind: 'secret-scan-truncated', bytes: diff.out.length, scanned: text.length });
    }

    // 3. One pass over every added line in the whole diff. The common case is
    //    clean and pays for a single regex battery, not a per-file split.
    const all = addedLines(text);
    if (!all || redactSecrets(all) === all) return true;

    // 4. Something matched — split per file to name it. `^diff --git ` is the
    //    per-file boundary; the b-side of `+++` is the path as it will be
    //    committed (it survives renames, where the a-side does not).
    let safe = true;
    for (const section of text.split(/^diff --git /m).slice(1)) {
      const plus = addedLines(section);
      if (!plus || redactSecrets(plus) === plus) continue;
      const rel = /^\+\+\+ b\/(.+)$/m.exec(section)?.[1];
      if (!rel) {
        console.warn('[hive] FLOOR-04: a secret-shaped value is staged under a path this scrub could not name — NOT committing');
        this.appendLog({ kind: 'secret-blocked', reason: 'unresolved-path' });
        safe = false;
        continue;
      }
      if (await this.harnessAuthored(root, rel)) continue;
      if (!(await this.unstagePath(root, rel))) {
        console.warn(`[hive] FLOOR-04: ${rel} carries a secret-shaped value and could NOT be unstaged — NOT committing`);
        this.appendLog({ kind: 'secret-blocked', reason: 'unstage-failed', path: rel });
        safe = false;
        continue;
      }
      console.warn(
        `[hive] FLOOR-04: unstaged ${rel} — it carries a secret-shaped value, and it has been kept OUT of the hive's `
        + 'git history. The file is untouched on disk; remove the credential from it, or it will be skipped again on every commit.'
      );
      this.appendLog({ kind: 'secret-scrubbed', path: rel });
    }
    return safe;
  }

  /** The debounced commit body — async end to end. Two attempts at a 2 s timeout,
   *  with a TIMER backoff rather than a blocking sleep: a repo whose lock is held
   *  by something outside this process is retried by the next mutation anyway, so
   *  a long in-process fight buys nothing and costs the supervisor. */
  private async flushCommit(root: string): Promise<void> {
    // A flush is already running — fold this window into the next one rather
    // than run two `add -A` passes against the same index.
    if (this.committing) { this.scheduleCommit(root); return; }
    this.committing = true;
    try {
      await this.untrackIgnored(root);
      const { subject, body } = this.drainCommitMessages();
      for (let attempt = 0; attempt < GIT_ATTEMPTS; attempt++) {
        this.clearStaleLock(root);
        const add = await this.gitAsync(['add', '-A'], root);
        // FLOOR-04: the scrub sits INSIDE the retry loop, not above it, because
        // every attempt re-runs `add -A` — a scrub hoisted out would be undone
        // by the second attempt's staging and the secret would ride in on the
        // retry. It returns false only when a secret is staged that it could not
        // unstage; committing anyway would put it in history permanently, and
        // the files are already durable on disk either way.
        if (!(await this.scrubStagedSecrets(root))) return;
        const commit = await this.gitAsync(
          ['commit', '-q', '-m', subject, ...(body ? ['-m', body] : [])],
          root
        );
        if (commit.ok) return;
        if (/nothing to commit/i.test(commit.out + commit.err)) return;
        if (!add.ok || /index\.lock/i.test(commit.err)) {
          await new Promise((r) => setTimeout(r, GIT_RETRY_MS * (attempt + 1)));
          continue;
        }
        return; // a non-lock failure — give up quietly, the next mutation retries
      }
    } finally {
      this.committing = false;
    }
  }

  /** Delete an ABANDONED `.git/index.lock` (a git that crashed leaves one behind
   *  and every later commit fails on it). Never one of ours — gitInFlight — and
   *  never one younger than STALE_LOCK_MS, which must stay well above our own git
   *  timeout: the old 10 s was BELOW the old 8 s timeout, so a slow-but-alive git
   *  (a large `add -A` behind Windows antivirus) could have its LIVE lock deleted. */
  private clearStaleLock(root: string): void {
    if (this.gitInFlight) return;
    const lock = join(root, '.git', 'index.lock');
    try {
      if (existsSync(lock) && Date.now() - statSync(lock).mtimeMs > STALE_LOCK_MS) rmSync(lock);
    } catch { /* noop */ }
  }
}

// ─── PROTOCOL.md (written into the hive, readable by every agent) ────────────

/** The Claude Code command reference written to <hive>/COMMANDS.md, rendered from
 *  the SAME source as the UI "commands" tab so they never drift. Leads with the
 *  orchestrator note: slash = own session only, cli = shell/fleet; monitor
 *  siblings via fleet.json (claude agents does NOT see them). */
function renderCommandsMd(): string {
  const lines: string[] = [
    '# Claude Code commands',
    '',
    'Reference of the Claude Code commands available to you. Two kinds:',
    '- **slash** commands act ONLY on your own session — you CANNOT run them on another agent\'s terminal.',
    '- **cli** commands run in your shell (Bash) and can target the fleet, spawn, or query.',
    '',
    'To MONITOR the other agents in this hive, read `fleet.json` in the hive root (live per-agent tokens, cost, status, last tool, breaker level, inbox backlog) plus `registry.json` — `claude agents` does NOT list your hive siblings. Use `claude -p "..." --output-format json` for a one-off headless query.',
    '',
    'Two harness commands are NOT Claude Code commands and are documented in `PROTOCOL.md`, not below: `bin/task.cjs {add|patch|claim|done}` — the ONLY safe way to change `tasks.json` — and the `spawn-requests/` queue, which spins up a fresh isolated worker from one JSON file.',
    ''
  ];
  for (const g of COMMAND_GROUPS) {
    lines.push(`## ${g.title}`, '');
    for (const it of g.items) {
      lines.push(`- \`${it.cmd.trim()}\` _(${it.kind})_ — ${it.desc}${it.usage ? ` e.g. \`${it.usage}\`` : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
const COMMANDS_MD = renderCommandsMd();

// ─── bin/task.cjs — the one-card ledger CLI (#17) ────────────────────────────
// The ledger has several independent writers and agents were told to edit
// tasks.json with their Write tool: read the file, think, write the whole thing
// back — erasing the humanQA answer or webhook card that landed in between. This
// CLI mutates ONE card under compare-and-swap on the ledger's `rev`, retrying
// when it loses a race, so an agent can never clobber work it never saw.
//
// Mirrors HiveManager's own CAS (see mutateTasks) rather than sharing it: this
// runs as a separate process from the agent's shell and has no access to main.
const TASK_CLI = `#!/usr/bin/env node
'use strict';
// hive/bin/task.cjs — mutate ONE task card safely. See PROTOCOL.md.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const LEDGER = path.join(ROOT, 'tasks.json');
const STATUSES = ['todo', 'doing', 'blocked', 'done'];

function die(msg) { process.stdout.write(JSON.stringify({ ok: false, error: msg }) + '\\n'); process.exit(1); }
function ok(extra) { process.stdout.write(JSON.stringify(Object.assign({ ok: true }, extra)) + '\\n'); }

function read() {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(LEDGER, 'utf8')); } catch (e) { raw = {}; }
  return {
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
    rev: typeof raw.rev === 'number' && raw.rev >= 0 ? raw.rev : 0
  };
}

/** Write only if nobody else wrote since \`expectedRev\`. Atomic (tmp+rename). */
function write(tasks, expectedRev) {
  if (read().rev !== expectedRev) return false;
  const tmp = LEDGER + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify({ tasks: tasks, rev: expectedRev + 1, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
  fs.renameSync(tmp, LEDGER);
  return true;
}

/** Read → mutate one card → CAS. Retries a lost race a few times; never
 *  overwrites a ledger it has not just read. */
function mutate(fn) {
  for (let i = 0; i < 5; i++) {
    const led = read();
    const next = fn(led.tasks);
    if (!next) return null;               // fn refused (not found / duplicate)
    if (write(next.tasks, led.rev)) return next.card;
  }
  die('ledger too busy — 5 compare-and-swap attempts lost; retry');
}

function flags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].slice(0, 2) !== '--') continue;
    const key = argv[i].slice(2);
    const val = argv[i + 1] !== undefined && argv[i + 1].slice(0, 2) !== '--' ? argv[++i] : 'true';
    out[key] = val;
  }
  return out;
}
function num(v) { const n = Number(v); return isFinite(n) ? n : undefined; }

const [cmd, ...rest] = process.argv.slice(2);
const f = flags(rest);
const arg0 = rest[0] && rest[0].slice(0, 2) !== '--' ? rest[0] : null;

if (cmd === 'add') {
  const title = arg0 || f.title;
  if (!title) die('usage: task.cjs add "<title>" [--assignee id] [--desc text] [--priority N] [--budget-tokens N] [--depends a,b]');
  const card = {
    id: 'task-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
    title: title,
    status: STATUSES.indexOf(f.status) >= 0 ? f.status : 'todo',
    dependsOn: f.depends ? String(f.depends).split(',').filter(Boolean) : [],
    priority: num(f.priority) !== undefined ? num(f.priority) : 3,
    createdAt: new Date().toISOString()
  };
  if (f.desc) card.description = f.desc;
  if (f.assignee) card.assignee = f.assignee;
  if (num(f['budget-tokens']) !== undefined) card.budgetTokens = num(f['budget-tokens']);
  mutate(function (tasks) { return { tasks: tasks.concat([card]), card: card }; });
  return ok({ task: card });
}

if (cmd === 'patch' || cmd === 'claim' || cmd === 'done') {
  const id = arg0 || f.id;
  if (!id) die('usage: task.cjs ' + cmd + ' <task-id> [flags]');
  const patch = {};
  if (cmd === 'claim') {
    patch.assignee = f.assignee || process.env.AGENT_ID || die('claim needs --assignee (or AGENT_ID in the environment)');
    patch.status = 'doing';
  } else if (cmd === 'done') {
    patch.status = 'done';
    if (f.result) patch.result = f.result;
  } else {
    if (f.status) {
      if (STATUSES.indexOf(f.status) < 0) die('status must be one of ' + STATUSES.join(', '));
      patch.status = f.status;
    }
    for (const k of ['title', 'description', 'assignee', 'result']) if (f[k]) patch[k] = f[k];
    if (num(f.priority) !== undefined) patch.priority = num(f.priority);
    if (num(f['budget-tokens']) !== undefined) patch.budgetTokens = num(f['budget-tokens']);
    if (f.q) patch.__q = f.q;
  }
  const card = mutate(function (tasks) {
    const i = tasks.findIndex(function (t) { return t && t.id === id; });
    if (i < 0) return null;
    const merged = Object.assign({}, tasks[i], patch, { id: id });
    // --q appends a human question and blocks the card, matching the humanQA
    // contract in PROTOCOL.md (never replace the history — it IS the decision trail).
    if (patch.__q) {
      delete merged.__q;
      merged.humanQA = (Array.isArray(tasks[i].humanQA) ? tasks[i].humanQA : []).concat([{ q: patch.__q, askedAt: new Date().toISOString() }]);
      merged.status = 'blocked';
    }
    const next = tasks.slice();
    next[i] = merged;
    return { tasks: next, card: merged };
  });
  if (!card) die('no task with id ' + id);
  return ok({ task: card });
}

die('usage: task.cjs {add|patch|claim|done} … — see PROTOCOL.md');
`;

const PROTOCOL_MD = `# Hive protocol

You are one of several Claude agents sharing this hive. Coordination is entirely
file-based; the harness (main process) is the only thing that runs git and the
only thing that moves messages between agents.

## Your workspace — \`agents/<your-id>/\`
- \`identity.md\`  — who you are (read-only; the harness writes it).
- \`memory.md\`    — your long-term memory. Read at the start of a task; append to it as you learn.
- \`inbox/\`       — messages addressed to you. Read them at the start of a task.
- \`inbox/.done/\` — move a message here once you've handled it.
- \`outbox/\`      — drop messages here to send them. The harness delivers them.

**Never write into another agent's folder.** Write to your own \`outbox/\`; the
orchestrator routes it. This keeps every file single-writer.

## Sending a message
Write one JSON file into \`outbox/\` (any filename ending in \`.json\`):

\`\`\`json
{
  "to": "<agent-id> | god | broadcast",
  "act": "request | inform | propose | query | agree | refuse | done",
  "subject": "one-line summary",
  "body": "the details",
  "conversation": "carry this across a thread (optional)",
  "in_reply_to": "<message id you're replying to> (optional)"
}
\`\`\`

The harness fills in \`id\`, \`from\`, \`hops\`, and timestamps.

## Rules of the road
- Only \`request\`, \`query\`, and \`propose\` expect a reply. \`inform\` and \`done\` are terminal —
  don't reply to them, or two agents will loop forever.
- A message that expects a reply has a **deadline**. If you don't answer within 15 minutes it is
  re-delivered to you once; still unanswered 15 minutes later, it is escalated to \`god\` as
  \`[unanswered]\` with your name on it. Answer, or say you can't — silence is now visible.
- A thread that bounces more than 12 times is **escalated to \`god\`** (subject \`[hop-cap …]\`),
  not dropped. If you receive one, break the loop: decide, or ask the human.
- For anything ambiguous, cross-cutting, or needing sign-off, message \`god\` — the
  god agent clarifies answers for you so you rarely need the human directly.
- There is NO separate human-approval queue. Human-in-the-loop is native to Claude
  Code: a tool you run that needs permission prompts in your own session (the human
  can approve it remotely from their phone via \`/remote-control\`). If you genuinely
  need a human decision, raise it with \`god\` (a message \`"to": "human"\` is routed to
  the god/orchestrator, the human's proxy on the floor).
- \`board.md\` is the shared plan. Don't edit it directly — \`propose\` changes to \`god\`,
  who is its sole scribe.
- Re-reading a message you already moved to \`.done/\` is a no-op. Don't reprocess.

## The work: board.md vs tasks.json
There are two shared surfaces, both in the hive root:
- \`board.md\` — the freeform narrative plan. The god agent is its sole scribe; others \`propose\` edits.
- \`tasks.json\` — the structured task ledger (a kanban: \`todo / doing / blocked / done\`, with title,
  assignee, priority, deps). Keep the task you're working reflected in its status.

### NEVER write tasks.json with your Write tool
It has several writers at once — you, the harness, the kanban UI, inbound webhooks and Slack. If you
read the file, think for thirty seconds, and write the whole thing back, you **erase** every card and
every human answer that landed while you were thinking. That is not hypothetical; it is why this
section exists.

Mutate ONE card at a time through \`bin/task.cjs\` instead. It compare-and-swaps on the ledger's
\`rev\` and retries when it loses a race, so it can never clobber work it never saw. Run it through the
bundled node launcher — \`bin/hive-node\` on macOS/Linux, \`bin/hive-node.cmd\` on Windows; the
absolute path is in your \`HIVE_NODE\` environment variable — e.g.
\`<HIVE_NODE> <hive-root>/bin/task.cjs claim task-123\`:

\`\`\`
task.cjs add "<title>" [--desc <text>] [--assignee <agent-id>] [--priority N]
                       [--depends id1,id2] [--budget-tokens N]
task.cjs claim <task-id> [--assignee <agent-id>]     # → assignee + status doing (defaults to you)
task.cjs patch <task-id> [--status todo|doing|blocked|done] [--title …] [--description …]
                         [--assignee …] [--result …] [--priority N] [--budget-tokens N]
                         [--q "<question for the human>"]   # appends humanQA + blocks the card
task.cjs done  <task-id> [--result "<what you actually delivered>"]
\`\`\`

Each command prints one line of JSON (\`{"ok":true,"task":{…}}\`) so you can check the result.
\`--budget-tokens\` is that card's token cap: cost-ledger rows carry the card's \`task_id\`, so spend is
attributed per card, not just per agent.

### A finished card gets reviewed
\`done\` is no longer the end of the story. When a card reaches \`done\`, the harness mails the
least-loaded idle agent that is NOT the assignee a \`query\` on conversation \`review-<task-id>\`.
If that's you: check the work and reply on the same conversation with \`act:"agree"\` (it holds up) or
\`act:"refuse"\` (it doesn't — say what is missing). A refusal puts the card back to \`doing\`.
So write a real \`result\` on the card: someone else is about to read it.

## Spawning a fresh worker (god)
Beyond messaging existing agents, god can ask the harness for a brand-new ISOLATED worker by
dropping one JSON file into \`spawn-requests/\` in the hive root. Main polls that queue on the same
cadence as the router, spins up the worker (its own git worktree by default), dispatches the
objective through the normal inbox path, then watches it: a terminal \`act:"done"\` releases it, and
prolonged idleness reaps it. Teardown never removes a worktree that still holds unintegrated work.

\`\`\`json
{
  "objective": "what the worker must accomplish — the whole brief, it starts with nothing else",
  "cwd": "/absolute/path/to/the/repo it works in",
  "name": "display name (optional)",
  "command": "engine CLI (optional; defaults to the configured one)",
  "model": "model override (optional, Claude)",
  "isolate": true,
  "tokenCap": 200000,
  "slack": { "channel": "C…", "thread_ts": "…" }
}
\`\`\`

\`objective\` and \`cwd\` are the only required fields. Processed requests move to
\`spawn-requests/.done/\`; rejected ones to \`.failed/\`, and you are informed why. Prefer routing to an
agent already on the floor — spawn only when nobody there fits.

## Guardrails: circuit breaker & token budgets
A circuit breaker watches every agent for runaway behavior (looping on the same tool, error storms,
overspending). It escalates gently: \`steer\` → \`constrain\` → \`stop\`. If a \`Circuit breaker: steer\`
or \`Circuit breaker: constrain\` message lands in your inbox, you ARE the problem it caught — stop
repeating, summarize what you've tried, and do exactly what the message says (constrain = go read-only
and get god's sign-off before more tool calls). Be **token-frugal**: the floor has a token budget and
each agent can have its own token limit; crossing it trips the breaker. Prefer references over pasted
content, and \`/compact\` your own session when context gets heavy.

## Fleet monitoring (orchestrator)
You (god) are responsible for situational awareness. To see the live state of every agent, read
\`fleet.json\` in the hive root — it is refreshed continuously with each agent's tokens, cost, status,
breaker level, last tool, last-active time, and inbox backlog. Pair it with \`registry.json\` (the roster)
and \`log.jsonl\` (the event feed). IMPORTANT: \`claude agents\` will NOT show your hive's sibling
sessions (they're spawned independently) — \`fleet.json\` is your source of truth for them. For a deeper
look at one agent, read its \`agents/<id>/memory.md\` and \`inbox/\`, or send it a \`query\`. A full
Claude Code command reference (slash = your own session only; CLI = your shell, can target the fleet)
is in \`COMMANDS.md\` in the hive root.

## Semantic memory (optional — when \`mempalace\` is installed)
When \`MEMPALACE_PALACE_PATH\` is set in your environment, the hive shares a
searchable MemPalace and you have the \`mempalace\` CLI:
- \`mempalace search "<query>"\` — recall relevant past knowledge across the whole
  team by meaning (not just keywords). Add \`--wing <agent-id>\` to scope to one
  agent, \`--results N\` to widen.
- \`mempalace wake-up\` — a short digest of what matters, good at the start of a task.

Your \`memory.md\` is mined into the palace automatically, so the durable facts you
write there become searchable by every agent. You don't run \`mine\` yourself.
`;

// ─── cth-hook shim (written to <hive>/bin/cth-hook.cjs) ──────────────────────
// A minimal pipe: read the hook payload on stdin, tag it with this agent's id,
// forward it to the hive's UDS, and relay the response back to `claude`. All the
// real logic lives in the main process (HookServer). Never blocks a stop on error.
const HOOK_SHIM = `#!/usr/bin/env node
'use strict';
const net = require('net');
const isStatus = process.argv.includes('--status');
let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { data += d; });
process.stdin.on('end', () => {
  let payload = {};
  try { payload = JSON.parse(data || '{}'); } catch (_) {}
  if (!payload.agent_id) payload.agent_id = process.env.AGENT_ID || null;
  // The socket authenticates on possession of this value (hooks.ts authorized()).
  // Without it EVERY hook is rejected and the whole floor goes quiet — no status,
  // no cost, no idle detection. Set it from the env main puts on the agent PTY.
  payload.sock_token = process.env.HIVE_SOCK_TOKEN || '';
  const sock = process.env.HIVE_SOCK;
  if (isStatus) {
    // Status-line mode: Claude Code pipes the session status JSON (incl.
    // context_window.total_input_tokens / .context_window_size) after every
    // response. Print the in-terminal gauge IMMEDIATELY (the TUI is waiting),
    // then forward the payload to the harness fire-and-forget so the agent
    // card's context gauge updates push-based, with the EXACT window size.
    payload.hook_event_name = 'Status';
    const cw = payload.context_window || {};
    const used = cw.total_input_tokens, size = cw.context_window_size;
    if (typeof used === 'number' && typeof size === 'number' && size > 0) {
      const pct = Math.round((used / size) * 100);
      process.stdout.write('ctx ' + Math.round(used / 1000) + 'k/' + Math.round(size / 1000) + 'k (' + pct + '%)');
    }
    if (sock) {
      try {
        const c = net.createConnection(sock, () => { c.end(JSON.stringify(payload) + '\\n'); });
        c.on('error', () => {});
        c.on('close', () => process.exit(0));
      } catch (_) { process.exit(0); }
    } else {
      process.exit(0);
    }
    setTimeout(() => process.exit(0), 1500).unref();
    return;
  }
  if (!sock) { process.exit(0); }
  let resp = '';
  const done = (code) => { if (resp) process.stdout.write(resp); process.exit(code); };
  const c = net.createConnection(sock, () => c.write(JSON.stringify(payload) + '\\n'));
  c.setEncoding('utf8');
  c.on('data', (d) => { resp += d; });
  c.on('end', () => done(0));
  c.on('error', () => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
});
`;

// ─── agy-hook shim (written to <hive>/bin/agy-hook.cjs) ──────────────────────
// Antigravity's `agy` CLI fires lifecycle hooks (PreToolUse/PostToolUse/Stop/
// PreInvocation/PostInvocation) but with a DIFFERENT stdin shape than Claude
// (conversationId / toolCall{name,args} / workspacePaths, and no hook_event_name
// — the event arrives as argv from the hooks.json command). This shim normalizes
// that into the same HookPayload the HookServer already consumes, so status,
// inbox-drain-on-Stop, and tool gating are reused UNCHANGED, then translates the
// server's Claude-shaped response back into agy's stdout contract (decision:
// allow|deny|block + a message). Scoped by AGENT_ID: a personal agy session
// (no AGENT_ID in env) is a no-op, so the global hooks.json never disturbs the
// user's own agy usage — only hive workers (spawned with AGENT_ID set) bridge.
// NOTE (agy bug, antigravity-cli#49): the loader reads ~/.gemini/antigravity-cli/
// hooks.json but the trigger reads ~/.gemini/config/hooks.json — we write BOTH.
const AGY_HOOK_SHIM = `#!/usr/bin/env node
'use strict';
const net = require('net');
const event = process.argv[2] || 'Unknown';
const agentId = process.env.AGENT_ID || null;
let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { data += d; });
process.stdin.on('end', () => {
  const sock = process.env.HIVE_SOCK;
  if (!agentId || !sock) { process.exit(0); } // not a hive worker → ignore
  let agy = {};
  try { agy = JSON.parse(data || '{}'); } catch (_) {}
  const tc = agy.toolCall || {};
  const payload = {
    hook_event_name: event,
    agent_id: agentId,
    // See HOOK_SHIM: without this the socket rejects every payload.
    sock_token: process.env.HIVE_SOCK_TOKEN || '',
    session_id: agy.conversationId,
    transcript_path: agy.transcriptPath,
    cwd: Array.isArray(agy.workspacePaths) ? agy.workspacePaths[0] : undefined,
    tool_name: tc.name,
    tool_input: tc.args
  };
  let resp = '';
  const done = () => {
    // Translate the HookServer's Claude-shaped reply into agy's contract. CRITICAL:
    // agy treats ANY object written to stdout as a decision and FAIL-CLOSES (an
    // empty/decision-less object = DENY). So emit JSON ONLY when there's a real
    // directive (deny/block/steer); otherwise write NOTHING — no output = allow.
    let out = null;
    try {
      const r = JSON.parse(resp || '{}');
      if (r.decision === 'block') out = { decision: 'block', reason: r.reason, stopReason: r.reason, systemMessage: r.reason };
      else if (r.hookSpecificOutput && r.hookSpecificOutput.permissionDecision === 'deny') out = { decision: 'deny', reason: r.hookSpecificOutput.permissionDecisionReason };
      else if (r.continue === false) out = { decision: 'block', stopReason: r.stopReason };
      else if (r.hookSpecificOutput && r.hookSpecificOutput.additionalContext) out = { systemMessage: r.hookSpecificOutput.additionalContext };
    } catch (_) {}
    if (out) { try { process.stdout.write(JSON.stringify(out)); } catch (_) {} }
    process.exit(0);
  };
  try {
    const c = net.createConnection(sock, () => c.write(JSON.stringify(payload) + '\\n'));
    c.setEncoding('utf8');
    c.on('data', (d) => { resp += d; });
    c.on('end', done);
    c.on('error', () => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  } catch (_) { process.exit(0); }
});
`;

// ─── pi bridge extension (written to <agentDir>/.pi-agent/extensions/) ───────
// A bundled extension for Pi (earendil-works). Pi exposes a pi.on(event,…)
// lifecycle; this posts cth-hook-shaped payloads to HIVE_SOCK on tool_call /
// tool_result / agent_end and AUTO-APPROVES tool calls when the floor is in auto
// mode (HIVE_AUTO_APPROVE, gated by config.autoMode — Pam guardrail #5). The
// agent_end→Stop keeps the harness status in step (→ idle) so the renderer idle
// inbox-wake nudge can deliver mail. Fully wrapped so a wrong API guess can never
// break the spawn. LIVE-UNVERIFIED (Pi's exact extension surface needs BYOK keys).
const PI_EXTENSION = `'use strict';
var net = require('node:net');
var SOCK = process.env.HIVE_SOCK;
var AGENT = process.env.AGENT_ID || null;
var AUTO = process.env.HIVE_AUTO_APPROVE === '1';
function post(payload) {
  try {
    if (!SOCK) return;
    payload.agent_id = payload.agent_id || AGENT;
    // See HOOK_SHIM: without this the socket rejects every payload.
    payload.sock_token = process.env.HIVE_SOCK_TOKEN || '';
    var c = net.createConnection(SOCK, function () { try { c.end(JSON.stringify(payload) + '\\n'); } catch (e) {} });
    c.on('error', function () {});
  } catch (e) {}
}
function register(pi) {
  if (!pi || typeof pi.on !== 'function') return false;
  try {
    pi.on('tool_call', function (ev) {
      post({ hook_event_name: 'PreToolUse', tool_name: ev && (ev.name || (ev.tool && ev.tool.name)), tool_input: ev && (ev.args || ev.input) });
      if (AUTO) { try { if (ev && typeof ev.approve === 'function') ev.approve(); } catch (e) {} return { approve: true }; }
      return undefined;
    });
    pi.on('tool_result', function (ev) { post({ hook_event_name: 'PostToolUse', tool_name: ev && (ev.name || (ev.tool && ev.tool.name)) }); });
    pi.on('agent_end', function () { post({ hook_event_name: 'Stop' }); });
    return true;
  } catch (e) { return false; }
}
try { if (typeof globalThis !== 'undefined' && globalThis.pi) register(globalThis.pi); } catch (e) {}
module.exports = function (pi) { return register(pi); };
module.exports.activate = function (pi) { return register(pi); };
module.exports.default = module.exports;
`;

// ─── opencode bridge plugin (written to <agentDir>/.opencode/plugin/) ────────
// A bundled plugin for OpenCode (anomalyco/opencode) — god Decision 1. OpenCode
// has no Claude-shaped Stop hook but its plugin API exposes a real session.idle
// event; this posts cth-hook-shaped payloads to HIVE_SOCK on tool.execute.before/
// after + session.idle. The session.idle→Stop keeps status in step (→ idle) so the
// renderer idle inbox-wake nudge delivers mail. ESM (OpenCode runs on Bun). Fully
// wrapped. LIVE-UNVERIFIED (plugin auto-load + session.idle firing need BYOK keys).
const OPENCODE_PLUGIN = `import { createConnection } from 'node:net';
const SOCK = process.env.HIVE_SOCK;
const AGENT = process.env.AGENT_ID || null;
function post(payload) {
  try {
    if (!SOCK) return;
    payload.agent_id = payload.agent_id || AGENT;
    // See HOOK_SHIM: without this the socket rejects every payload.
    payload.sock_token = process.env.HIVE_SOCK_TOKEN || '';
    const c = createConnection(SOCK, () => { try { c.end(JSON.stringify(payload) + '\\n'); } catch (e) {} });
    c.on('error', () => {});
  } catch (e) {}
}
export const HiveBridge = async () => {
  return {
    event: async (input) => {
      try { if (input && input.event && input.event.type === 'session.idle') post({ hook_event_name: 'Stop' }); } catch (e) {}
    },
    'tool.execute.before': async (input) => {
      try { post({ hook_event_name: 'PreToolUse', tool_name: input && (input.tool || input.name) }); } catch (e) {}
    },
    'tool.execute.after': async (input) => {
      try { post({ hook_event_name: 'PostToolUse', tool_name: input && (input.tool || input.name) }); } catch (e) {}
    }
  };
};
export default HiveBridge;
`;

// ─── proxy-bridge sidecar (written to <hive>/bin/hive-proxy.cjs) ─────────────
// One per proxy-tier agent (qwen). A dependency-free, loopback-only reverse
// proxy: the agent's CLI is pointed at this (via ANTHROPIC_BASE_URL/OPENAI_BASE_URL),
// and it forwards every request to the user's real upstream UNCHANGED (headers,
// body, streaming). It TEES each response to synthesize the same HIVE_SOCK payloads
// the hook shims emit — Status (context gauge), PostToolUse (breaker), Stop (idle
// drain), and the new CostSample (cost ledger) — so a hookless CLI becomes a hive
// citizen. NEVER logs bodies or keys; the captured body is parsed in-memory and
// dropped. Idle is heuristic: a turn that ends with no tool call and no new request
// within an ~800ms debounce → Stop (a new request cancels it).
const PROXY_BRIDGE_SHIM = `#!/usr/bin/env node
'use strict';
const http = require('http');
const https = require('https');
const net = require('net');
const { URL } = require('url');

const SOCK = process.env.HIVE_SOCK;
const AGENT_ID = process.env.AGENT_ID || null;
const UPSTREAM = process.env.UPSTREAM_BASE_URL || '';
const SESSION = process.env.HIVE_PROXY_SESSION || null;
const API = process.env.HIVE_PROXY_API === 'anthropic' ? 'anthropic' : 'openai';

function trimSlash(s) { while (s.length && s.charAt(s.length - 1) === '/') s = s.slice(0, -1); return s; }

// Per-model context-window size for the Status gauge; fallback 200k.
function ctxSize(model) {
  const m = String(model || '').toLowerCase();
  if (m.indexOf('[1m]') !== -1 || m.indexOf('-1m') !== -1) return 1000000;
  if (m.indexOf('claude') !== -1) return 200000;
  if (m.indexOf('gpt-4o') !== -1 || m.indexOf('gpt-4.1') !== -1 || m.indexOf('o1') !== -1 || m.indexOf('o3') !== -1) return 128000;
  if (m.indexOf('qwen') !== -1) return 262144;
  return 200000;
}

// Fire-and-forget emit of a shim-shaped payload to the hive socket. Never throws.
function emit(payload) {
  if (!SOCK) return;
  // See HOOK_SHIM: without this the socket rejects every payload. Set HERE, in
  // the one function every Status/CostSample/PostToolUse/Stop goes through,
  // rather than at the five call sites.
  payload.sock_token = process.env.HIVE_SOCK_TOKEN || '';
  try {
    const c = net.createConnection(SOCK, function () { c.end(JSON.stringify(payload) + '\\n'); });
    c.on('error', function () {});
  } catch (e) {}
}

let stopTimer = null;
function armStop() {
  if (stopTimer) clearTimeout(stopTimer);
  stopTimer = setTimeout(function () {
    stopTimer = null;
    emit({ hook_event_name: 'Stop', agent_id: AGENT_ID, session_id: SESSION });
  }, 800);
  if (stopTimer.unref) stopTimer.unref();
}
function cancelStop() { if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; } }

function safeArgs(s) {
  if (s == null) return {};
  if (typeof s === 'object') return s;
  try { return JSON.parse(s); } catch (e) { return { _raw: String(s).slice(0, 500) }; }
}

// Parse a completed response (single JSON or an SSE stream) and synthesize events.
function parseAndEmit(bodyStr, isSse) {
  const objs = [];
  if (isSse) {
    const lines = bodyStr.split('\\n');
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const idx = ln.indexOf('data:');
      if (idx === -1) continue;
      const data = ln.slice(idx + 5).trim();
      if (!data || data === '[DONE]') continue;
      try { objs.push(JSON.parse(data)); } catch (e) {}
    }
  } else {
    try { objs.push(JSON.parse(bodyStr)); } catch (e) {}
  }
  if (!objs.length) { armStop(); return; }

  let model = null, input = 0, output = 0, cacheRead = 0, cacheCreation = 0, sawUsage = false;
  const toolCalls = [];
  const oaiTools = {}; // accumulate streaming openai tool_calls by index

  for (let i = 0; i < objs.length; i++) {
    const o = objs[i];
    if (!o || typeof o !== 'object') continue;
    if (o.model) model = o.model;
    if (API === 'anthropic') {
      if (o.type === 'message_start' && o.message) {
        if (o.message.model) model = o.message.model;
        const u = o.message.usage || {};
        input += u.input_tokens || 0;
        cacheRead += u.cache_read_input_tokens || 0;
        cacheCreation += u.cache_creation_input_tokens || 0;
        sawUsage = true;
      } else if (o.type === 'message_delta' && o.usage) {
        output += o.usage.output_tokens || 0;
        sawUsage = true;
      } else if (o.type === 'content_block_start' && o.content_block && o.content_block.type === 'tool_use') {
        toolCalls.push({ name: o.content_block.name, input: o.content_block.input || {} });
      } else if (o.usage && !o.type) {
        // non-streaming full message body
        const u = o.usage;
        input += u.input_tokens || 0;
        output += u.output_tokens || 0;
        cacheRead += u.cache_read_input_tokens || 0;
        cacheCreation += u.cache_creation_input_tokens || 0;
        sawUsage = true;
      }
      if (Array.isArray(o.content)) {
        for (let j = 0; j < o.content.length; j++) {
          const blk = o.content[j];
          if (blk && blk.type === 'tool_use') toolCalls.push({ name: blk.name, input: blk.input || {} });
        }
      }
    } else {
      if (o.usage) {
        const u = o.usage;
        input += u.prompt_tokens || 0;
        output += u.completion_tokens || 0;
        if (u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens) cacheRead += u.prompt_tokens_details.cached_tokens;
        sawUsage = true;
      }
      const choices = o.choices || [];
      for (let c = 0; c < choices.length; c++) {
        const ch = choices[c];
        if (!ch) continue;
        if (ch.message && Array.isArray(ch.message.tool_calls)) {
          for (let t = 0; t < ch.message.tool_calls.length; t++) {
            const tc = ch.message.tool_calls[t];
            if (tc && tc.function) toolCalls.push({ name: tc.function.name, input: safeArgs(tc.function.arguments) });
          }
        }
        if (ch.delta && Array.isArray(ch.delta.tool_calls)) {
          for (let t = 0; t < ch.delta.tool_calls.length; t++) {
            const tc = ch.delta.tool_calls[t];
            if (!tc) continue;
            const k = (tc.index != null ? tc.index : t);
            if (!oaiTools[k]) oaiTools[k] = { name: null, args: '' };
            if (tc.function) {
              if (tc.function.name) oaiTools[k].name = tc.function.name;
              if (tc.function.arguments) oaiTools[k].args += tc.function.arguments;
            }
          }
        }
      }
    }
  }
  const keys = Object.keys(oaiTools);
  for (let i = 0; i < keys.length; i++) {
    const t = oaiTools[keys[i]];
    if (t.name) toolCalls.push({ name: t.name, input: safeArgs(t.args) });
  }

  if (sawUsage) {
    emit({ hook_event_name: 'Status', agent_id: AGENT_ID, context_window: { total_input_tokens: input + cacheRead + cacheCreation, context_window_size: ctxSize(model) } });
    emit({ hook_event_name: 'CostSample', agent_id: AGENT_ID, session_id: SESSION, model: model, input: input, output: output, cache_read: cacheRead, cache_creation: cacheCreation });
  }
  if (toolCalls.length) {
    cancelStop(); // a tool call means the turn continues
    for (let i = 0; i < toolCalls.length; i++) {
      emit({ hook_event_name: 'PostToolUse', agent_id: AGENT_ID, session_id: SESSION, tool_name: toolCalls[i].name, tool_input: toolCalls[i].input });
    }
  } else {
    armStop();
  }
}

let upstreamUrl = null;
try { upstreamUrl = new URL(UPSTREAM); } catch (e) {}

const server = http.createServer(function (req, res) {
  cancelStop(); // a new request means the turn is still going
  if (!upstreamUrl) { res.statusCode = 502; res.end('proxy: no upstream'); return; }
  let target;
  try { target = new URL(trimSlash(UPSTREAM) + req.url); } catch (e) { res.statusCode = 502; res.end('proxy: bad url'); return; }
  const isHttps = target.protocol === 'https:';
  const lib = isHttps ? https : http;
  const headers = Object.assign({}, req.headers);
  headers.host = target.host;
  // Ask upstream for plaintext so the tee can parse SSE/JSON reliably; the client
  // gets uncompressed bytes (loopback — negligible) and no content-encoding to undo.
  delete headers['accept-encoding'];
  const opts = {
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || (isHttps ? 443 : 80),
    method: req.method,
    path: target.pathname + target.search,
    headers: headers
  };
  const upReq = lib.request(opts, function (upRes) {
    res.writeHead(upRes.statusCode || 502, upRes.headers);
    const ct = String((upRes.headers['content-type'] || ''));
    const wantParse = ct.indexOf('json') !== -1 || ct.indexOf('event-stream') !== -1;
    const isSse = ct.indexOf('event-stream') !== -1;
    const chunks = [];
    let total = 0;
    upRes.on('data', function (chunk) {
      res.write(chunk); // stream straight through to the CLI
      if (wantParse && total < 4194304) { chunks.push(chunk); total += chunk.length; }
    });
    upRes.on('end', function () {
      res.end();
      if (wantParse && chunks.length) {
        try { parseAndEmit(Buffer.concat(chunks).toString('utf8'), isSse); } catch (e) {}
      }
    });
    upRes.on('error', function () { try { res.end(); } catch (e) {} });
  });
  upReq.on('error', function () { try { res.statusCode = 502; res.end('proxy: upstream error'); } catch (e) {} });
  req.pipe(upReq);
});

server.on('error', function () {
  try { process.stdout.write(JSON.stringify({ port: 0 }) + '\\n'); } catch (e) {}
  process.exit(0);
});
server.listen(0, '127.0.0.1', function () {
  const addr = server.address();
  const port = (addr && typeof addr === 'object') ? addr.port : 0;
  try { process.stdout.write(JSON.stringify({ port: port }) + '\\n'); } catch (e) {}
});
`;

// ─── grok-hook shim (written to <hive>/bin/grok-hook.cjs) ───────────────────
// Grok's lifecycle events and decisions are Claude-compatible, but the wire
// payload is camelCase and uses snake_case event values. Normalize the input for
// HookServer and translate its Claude-style permission denial into Grok's direct
// decision form. Scoped by AGENT_ID so the trusted global hook is inert outside
// harness-spawned workers.
const GROK_HOOK_SHIM = `#!/usr/bin/env node
'use strict';
const net = require('net');
const agentId = process.env.AGENT_ID || null;
let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { data += d; });
process.stdin.on('end', () => {
  const sock = process.env.HIVE_SOCK;
  if (!agentId || !sock) { process.exit(0); }
  let grok = {};
  try { grok = JSON.parse(data || '{}'); } catch (_) {}
  const names = {
    pre_tool_use: 'PreToolUse',
    post_tool_use: 'PostToolUse',
    post_tool_use_failure: 'PostToolUseFailure',
    permission_denied: 'PermissionDenied',
    stop: 'Stop',
    stop_failure: 'StopFailure',
    session_start: 'SessionStart',
    session_end: 'SessionEnd',
    user_prompt_submit: 'UserPromptSubmit',
    notification: 'Notification',
    subagent_start: 'SubagentStart',
    subagent_stop: 'SubagentStop',
    pre_compact: 'PreCompact',
    post_compact: 'PostCompact'
  };
  const payload = {
    hook_event_name: names[grok.hookEventName] || grok.hookEventName || 'Unknown',
    agent_id: agentId,
    // See HOOK_SHIM: without this the socket rejects every payload.
    sock_token: process.env.HIVE_SOCK_TOKEN || '',
    session_id: grok.sessionId,
    cwd: grok.cwd || grok.workspaceRoot,
    tool_name: grok.toolName,
    tool_input: grok.toolInput,
    stop_hook_active: grok.stopHookActive,
    prompt: grok.prompt,
    source: grok.source,
    notification_type: grok.notificationType,
    message: grok.message
  };
  let resp = '';
  const done = () => {
    let out = null;
    try {
      const r = JSON.parse(resp || '{}');
      if (r.continue === false) out = { continue: false, stopReason: r.stopReason };
      else if (r.decision === 'block') out = { decision: 'block', reason: r.reason };
      else if (r.hookSpecificOutput && r.hookSpecificOutput.permissionDecision === 'deny') {
        out = { decision: 'deny', reason: r.hookSpecificOutput.permissionDecisionReason };
      } else if (r.hookSpecificOutput && r.hookSpecificOutput.additionalContext) {
        out = r;
      }
    } catch (_) {}
    if (out) { try { process.stdout.write(JSON.stringify(out)); } catch (_) {} }
    process.exit(0);
  };
  try {
    const c = net.createConnection(sock, () => c.write(JSON.stringify(payload) + '\\n'));
    c.setEncoding('utf8');
    c.on('data', (d) => { resp += d; });
    c.on('end', done);
    c.on('error', () => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  } catch (_) { process.exit(0); }
});
`;
