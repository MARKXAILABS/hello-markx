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
  isAgentProvider,
  type AgentProvider
} from '../shared/agentProvider';
import { capabilityLine, providerCapabilities } from '../shared/providerAutomation';
import { MCP_CATALOG, mcpWiredFor, isSafeAgentId } from '../shared/mcpCatalog';
import { expandTilde } from './fs';
import { memoryBin } from './memory';
import {
  TASK_CLI,
  PROTOCOL_MD,
  HOOK_SHIM,
  PROXY_BRIDGE_SHIM
} from './hiveTemplates';
import { GitCommitter } from './gitCommitter';
import {
  installAgyHooks,
  installCodexHooks,
  installKimiConfig,
  installPiHooks,
  installOpenCodePlugin,
  installCrushConfig,
  installGrokHooks,
  hookSettings,
  buildDefaultMcpServers,
  effectiveMcpConsent
} from './hiveProvisioning';
import type { TerminalWorkOrder } from '../shared/queueDelivery';

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
 * The hive root IS a git repo (`git init` in ensureHive) and this blocking
 * wrapper spawns `git` as a child of the Electron MAIN process, inheriting
 * main's environment — as does GitCommitter's async twin (`gitAsync`,
 * gitCommitter.ts). Nothing stopped an agent writing
 * `<root>/.git/hooks/pre-commit` and having the next hive commit execute it —
 * arbitrary code with more privilege than the agent that planted it, reached
 * from outside the PreToolUse write gate (which cannot see the pi, opencode or
 * proxy tiers at all).
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

/** Rotate log.jsonl past this size (one generation kept). It is append-only with
 *  a dozen writers and was never rotated. */
const LOG_ROTATE_BYTES = 8 * 1024 * 1024;
/** How much of log.jsonl's tail logTail() reads. Bounded so an IPC/voice read
 *  never slurps a multi-megabyte file to show the last 200 events. */
const LOG_TAIL_BYTES = 64 * 1024;

/** Filesystem- and sort-safe timestamp, e.g. 2026-05-30T14-03-11-123Z. */
function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function shortRand(): string {
  return randomBytes(3).toString('hex');
}

/** Non-memory files `mempalace mine` must not ingest (Claude Code hooks config,
 *  cursor, raw inbox/outbox JSON). `mempalace mine` honors .gitignore, so we drop
 *  one in each agent dir; written on birth here and refreshed by the mine loop.
 *  `kimi-config.toml` differs from its four neighbours in KIND, not degree: the
 *  others are churn (session state, message queues); this one is a live
 *  CREDENTIAL — `kimi login` stores its OAuth token INSIDE the file
 *  installKimiConfig seeds (T-P02-07-01). This is the fail-closed guard, and it
 *  runs BEFORE any spawn writes the config (ensureMineIgnore is called at agent
 *  birth in ensureAgent, ahead of the install call). `scrubStagedSecrets` is
 *  deliberately NOT relied on for this file: it commits UNSCANNED above
 *  SECRET_SCAN_MAX_LINES, commits UNSCANNED when the staged diff cannot be
 *  read, matches on a redactSecrets regex battery rather than on knowing what
 *  the file IS, and carries a `harnessAuthored` bypass — none of which is a
 *  substitute for the credential never being staged in the first place.
 *  `mcp.json` (DAEMON-04, plan 02-11) is the same KIND of entry as
 *  `kimi-config.toml`: a live per-agent credential (a write/secret MCP
 *  server's API key, in `env`), not mere churn — same fail-closed reasoning,
 *  same append-only migration for existing agents for free. */
const MINE_IGNORE_LINES = ['settings.json', 'cursor.json', 'inbox/', 'outbox/', 'kimi-config.toml', 'mcp.json'];

/** Whether the INSTALLED codex accepts `--dangerously-bypass-hook-trust`.
 *
 *  It is not a constant of the world. Older codex builds took the flag; `codex-cli
 *  0.128.0` removed it, and codex refuses an unknown argument rather than ignoring
 *  it — `error: unexpected argument … found` / `process exited (code 2)` — so
 *  passing it blind killed every codex hive agent at spawn, before a single token.
 *
 *  Probed once per process and cached. `shell: true` on win32 because the binary is
 *  `codex.cmd` there and Node cannot exec a .cmd directly — the same lesson
 *  `scripts/mcp-live-probe.cjs` and `pty.ts`'s `where` probe already encode.
 *
 *  Fails CLOSED to "not supported": if the probe cannot run at all, spawning
 *  without the flag still produces a working agent (hooks may not fire), whereas
 *  spawning with an unsupported flag produces no agent at all. */
let codexHookTrust: boolean | null = null;
function codexAcceptsHookTrust(bin: string): boolean {
  if (codexHookTrust !== null) return codexHookTrust;
  try {
    const res = spawnSync(bin, ['--help'], {
      encoding: 'utf8', timeout: 10_000, shell: process.platform === 'win32'
    });
    codexHookTrust = /--dangerously-bypass-hook-trust/.test(`${res.stdout ?? ''}${res.stderr ?? ''}`);
  } catch { codexHookTrust = false; }
  return codexHookTrust;
}

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
  // 3. Known credential prefixes: OpenAI/Anthropic (sk-ant-, sk-proj-,
  //    sk-svcacct-, bare sk-), Slack (xoxb/xoxp/xoxa/xoxr/xoxs-, xapp-),
  //    GitHub (ghp_/gho_/ghu_/ghs_/ghr_, github_pat_), AWS access-key ids
  //    (AKIA…), Google API keys (AIza…).
  //
  //    THE sk- ARM IS SPLIT, AND THE SPLIT IS MEASURED, NOT TIDY. A vendor
  //    segment (ant-, proj-, svcacct-) discriminates on its own, so those
  //    three stay UNBOUNDED: a word boundary on them loses `q=key%3Dsk-proj-`
  //    + a key — a URL-encoded `=` in a curl line, a log or a stack trace —
  //    and `xsk-ant-…`, both of which redact without it.
  //    The BARE sk- body is ambiguous by construction and is the ONLY
  //    alternative with a measured false positive, so it alone carries the \b.
  //    It is what stops `desk-backend-engineer`, `desk-market-researcher`,
  //    `task-kanban-work-as-a-board-not-a-chat-log` and
  //    `risk-assessment-matrix-builder-v2` being read as vendor keys — four
  //    tracked files were dropped from every commit that touched them.
  //
  //    DECLARED TRADE, because an undeclared one is worse than the bug: that
  //    \b costs a LEGACY bare sk-<alnum> OpenAI key glued to a preceding word
  //    character. Five measured shapes, pinned as DECLARED LOSSES in
  //    test/voice-messages.test.cjs. A lookbehind — (?<![a-z])sk- — was
  //    measured and recovers two of the five with the same zero newly-unstaged
  //    paths over 481 tracked text files and 400 commits; it is the recorded
  //    upgrade path, not a hypothetical.
  //
  //    The other six alternatives are left EXACTLY as they were, with NO
  //    boundary. They have zero measured false positives across those same 481
  //    files and 400 commits, and a boundary on them loses `AWS` + `AKIA…` and
  //    `MY` + `github_pat_…`, both redacted today. One uniform rule is only
  //    smaller than six exceptions when the uniform rule is free; it is not.
  s = s.replace(
    /(?:sk-ant-[A-Za-z0-9_-]{16,}|sk-proj-[A-Za-z0-9_-]{16,}|sk-svcacct-[A-Za-z0-9_-]{16,}|\bsk-[A-Za-z0-9_-]{16,}|xox[bpaors]-[A-Za-z0-9-]{10,}|xapp-[A-Za-z0-9-]{10,}|gh[posru]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|AIza[A-Za-z0-9_-]{20,})/g,
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
  // 6. Unlabelled vendor keys spelled with an UNDERSCORE vendor segment.
  //    THESE RUN AFTER PATTERNS 1-5 DELIBERATELY, AND THE ORDER IS THE WHOLE
  //    DESIGN. A greedy [A-Za-z0-9_]{10,} body placed INSIDE pattern 3's
  //    alternation matches at an EARLIER position than the sk- arm and eats the
  //    leading "sk" of a following sk-ant- key, leaking the rest of it —
  //    measured, 20 bytes, on `sk_live_AAAAAAAAAAsk-ant-BBBBBBBBBBBBBBBB`.
  //    "Appending a branch to an alternation cannot subtract" is FALSE: it
  //    cannot subtract AT A POSITION, and it does subtract DOWNSTREAM.
  //    Running as their own statements, these two can only redact MORE, because
  //    every earlier pattern has already finished with the string. That is a
  //    property of STATEMENT ORDER you can check by reading the function,
  //    rather than of a lookahead enumerating every prefix a greedy body might
  //    swallow — an enumeration that is wrong the day a vendor prefix is added.
  //    A vendor segment is REQUIRED after the underscore so a bare long
  //    snake_case identifier can never satisfy the body. It is not free:
  //    `sk_test_helper_function` and `rk_live_stream_handler` DO match. That
  //    residual family is recorded in the ceiling on scrubStagedSecrets, and it
  //    unstages zero paths across 481 tracked text files and 400 commits.
  s = s.replace(/\bsk_(?:ant|live|test|proj)_[A-Za-z0-9_]{10,}/g, '[redacted]');
  s = s.replace(/\brk_(?:live|test)_[A-Za-z0-9_]{10,}/g, '[redacted]');
  return s;
}

// ─── HiveManager ────────────────────────────────────────────────────────────

export class HiveManager {
  /**
   * @param getHome  Lazily resolve harnessHome so the hive follows config changes.
   * @param emit     Optional sink for renderer-facing events (set by the main
   *                 process to `webContents.send`). Used to animate routed
   *                 messages on the office floor; a no-op in tests/headless.
   * @param handoff  D-11 gap 1: parks a terminal work order in main's queue
   *                 for a non-Claude (hookless or proxy-tier) agent, returning
   *                 whether it was accepted. Wired in `src/main/floor/boot.ts`
   *                 to `delivery.enqueue()` — see the comment there (copies
   *                 `index.ts`'s `claudeAccount:failover` interception in
   *                 shape and reasoning) for why this is a THIRD constructor
   *                 param and not an interception inside `emit`.
   */
  constructor(
    private getHome: () => string | null,
    private emit?: (channel: string, payload: unknown) => boolean | void,
    private handoff?: (order: TerminalWorkOrder) => boolean
  ) {}

  /** ADR-0004: the hive's single git committer, composed rather than
   *  inherited. HiveManager owns the only instance — commit()/flushCommit()
   *  below are one-line delegations, kept on this class so their names,
   *  signatures and (for flushCommit) `private` visibility never move out
   *  from under the six runtime call sites in test/hive-durability.test.cjs
   *  and test/engine-parity.test.cjs. */
  private committer = new GitCommitter({
    root: () => this.root(),
    log: (event) => this.appendLog(event),
    redactSecrets: (text) => redactSecrets(text)
  });

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
  /** IPC-01 / MAIN-02 class. Every per-agent path in this class is built here,
   *  so this is the one place a hostile id has to be stopped. `id` reaches this
   *  method from the RENDERER through `hive:memory`, `hive:inbox`,
   *  `hive:messages` and `mcp:agentState` — `'../agents/someone-else'` is a
   *  perfectly good string, and `mcpArmed('../agents/a1')` was MEASURED
   *  returning another agent's armed server list before any guard existed.
   *
   *  Guarding the callers one at a time is how this defect kept reappearing:
   *  `mcp:agentState` was fixed, then `mcp:grant`/`mcp:revoke` turned out to
   *  share the same ungated input, then the phase-02 security audit found
   *  `hive:memory`/`hive:inbox`/`voiceMessages` ungated as well. This guard is
   *  at the chokepoint instead, so a caller added tomorrow inherits it.
   *
   *  Throws rather than returning a sanitized path: a caller asking for an
   *  impossible agent has a bug or is hostile, and both deserve to fail loudly
   *  rather than silently read some other directory. The public read accessors
   *  below convert it to their own empty-value contract. */
  private agentDir(id: string): string {
    if (!isSafeAgentId(id)) throw new Error('unsafe agent id');
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

  /** Revoke whatever token is currently registered for an agent. This is BY AGENT,
   *  and that is safe ONLY where the caller has established that the map entry
   *  belongs to the thing being torn down.
   *
   *  Who owns that invariant, exactly:
   *   - `stopProxyBridge` and `mintProxyToken` call it BEFORE any re-mint, so the
   *     entry is still the outgoing generation's. Correct as written.
   *   - `startProxyBridge`'s exit handler CANNOT assume that — a restart mints the
   *     replacement synchronously and the dying sidecar's exit event lands after —
   *     so it guards on `this.proxyTokens.get(agentId) === token` against the token
   *     its own spawn was given, the way pty.ts's releaseHookToken releases the
   *     credential the session holds. It used to call this unguarded, which
   *     dead-hooked every proxy-tier agent from its second spawn onward. */
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
       *  HarnessConfig by the caller; undefined → catalog defaults apply. Only
       *  the `safe-readonly` tier is actually read from this map (D-27) — see
       *  `effectiveMcpConsent`. */
      mcpDefaults?: { [id: string]: { enabled: boolean } };
      /** This agent's per-server `write`/`secret` grants (D-27) — floor-wide
       *  `mcpDefaults` above no longer arms these; only this map does. */
      mcpAgentGrants?: { [mcpId: string]: { enabled: boolean } };
      /** Resolves a granted catalog id to its live decrypted secret, or
       *  undefined when unarmed/unavailable (D-28). Injected rather than
       *  imported: `getSecret` pulls in electron's `safeStorage`, and this
       *  module plus hiveProvisioning.ts stay electron-free so `node --test`
       *  can load them directly. */
      mcpSecret?: (mcpId: string) => string | undefined;
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
            if (desc.shim === 'agy') installAgyHooks(root, this.nodeRunUnquoted.bind(this));
            else if (desc.shim === 'codex') {
              env.CODEX_HOME = installCodexHooks(dir, this.shimPath(), this.nodeRunUnquoted.bind(this), meta.cwd);
              // Codex refuses to run hooks from a config dir without persisted
              // "hook trust" (normally an interactive gate). Our hooks.json is
              // hive-authored inside an isolated CODEX_HOME, so we bypass that gate
              // for this automated spawn — the flag's documented use ("automation
              // that already vets hook sources"). Without it the hooks silently
              // never fire. Must precede the positional prompt.
              //
              // GATED ON SUPPORT, because passing it blind is worse than not
              // passing it. `codex-cli 0.128.0` REMOVED this flag, and codex
              // rejects an unknown argument outright:
              //   error: unexpected argument '--dangerously-bypass-hook-trust' found
              //   – process exited (code 2) –
              // i.e. EVERY codex hive agent died at spawn, before printing a
              // single token. Observed live on 0.128.0 by the operator. A silent
              // hook degradation is recoverable; an engine that cannot start is
              // not, and PARITY says codex is a first-class citizen.
              if (codexAcceptsHookTrust(preset.defaultCommand)) preArgs.push('--dangerously-bypass-hook-trust');
              else console.warn(
                `[hive] codex does not accept --dangerously-bypass-hook-trust (${preset.defaultCommand}); `
                + 'spawning without it. Lifecycle hooks may not fire for this agent, so mail may not '
                + 'wake it — but the agent starts. Older codex builds took the flag; 0.128.0 removed it.'
              );
            }
            else if (desc.shim === 'kimi') {
              // Kimi Code (Moonshot) — the CODEX case (installKimiConfig,
              // hiveProvisioning.ts), not the grok case: HOOK_SHIM is reused
              // verbatim (kimi's hook payload is already Claude-shaped
              // snake_case). `--config-file` is a PER-INVOCATION flag, so the
              // operator's global ~/.kimi/config.toml is never mutated — the
              // same per-agent isolation codex gets, and the property D-26
              // originally disqualified kimi for. LIVE-UNVERIFIED: no
              // Moonshot account exists on this machine to run a live kimi
              // session against the file this writes.
              preArgs.push('--config-file', installKimiConfig({
                dir, shim: this.shimPath(), nodeRun: this.nodeRunUnquoted.bind(this), userHome: homedir()
              }));
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
              env.PI_CODING_AGENT_DIR = installPiHooks(dir);
            }
            else if (desc.shim === 'opencode') {
              // OpenCode (anomalyco/opencode) has no Claude-shaped Stop hook, but its
              // plugin API exposes a real session.idle event (god Decision 1). We drop
              // a bundled plugin into a PER-AGENT OPENCODE config dir that posts
              // HIVE_SOCK payloads on tool.execute.before/after + session.idle — the
              // same Stop→drain semantics, provider-agnostic, no traffic interception.
              // LIVE-UNVERIFIED (plugin auto-load + session.idle firing); the renderer
              // idle inbox-wake nudge is the guaranteed drain fallback.
              env.OPENCODE_CONFIG_DIR = installOpenCodePlugin(dir);
            }
            else if (desc.shim === 'grok') installGrokHooks(root, this.nodeRun.bind(this));
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
                const crush = installCrushConfig(dir, loopback, desc.api);
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
      // Neither a flag, nor a positional, nor type-into-tui: the hive protocol
      // was built above and is now DROPPED. This agent starts with no
      // identity, no protocol and no orientation — survivable while kimi could
      // only be a WORKER whose mail bounced (canReceiveInbox: false); not
      // survivable now that kimi is god-eligible (D-33). Record it rather than
      // silently spawning unoriented.
      this.appendLog({ kind: 'protocol-not-seeded', agentId: meta.id, provider: meta.provider });
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
      this.writeJson(settingsPath, hookSettings(shim, opts.theme, this.nodeRun.bind(this)));
      args.push('--settings', settingsPath);

      // DAEMON-04 — the default-MCP bundle rides `--mcp-config`, the channel
      // scripts/mcp-live-probe.cjs live-verified spawns a server (claude
      // 2.1.236); `mcpServers` inside --settings above is a measured no-op.
      // Gated on mcpWiredFor: claude is the one engine this build wires
      // (D-26 — nine other engines stay documented, not built).
      const mcpPath = join(dir, 'mcp.json');
      // D-27: the SAME predicate buildDefaultMcpServers already runs, fed a map
      // assembled per agent — safe-readonly from the floor, write/secret from
      // this agent's own grants. The resolver is main's, injected via opts.
      const consent = effectiveMcpConsent(opts.mcpDefaults, opts.mcpAgentGrants);
      const mcpServers = mcpWiredFor(meta.provider ?? 'claude')
        ? buildDefaultMcpServers(meta.cwd, consent, { secretFor: opts.mcpSecret })
        : {};
      if (Object.keys(mcpServers).length) {
        this.writeJson(mcpPath, { mcpServers }, 0o600);
        args.push('--mcp-config', mcpPath);
      } else {
        // Nothing armed (no consent, an unwired provider, or a revoke) — a
        // STALE file must not survive to re-arm the server on the next
        // spawn. This is what mcpArmed() reads to answer "what did the
        // running session actually get" (D-29).
        try { rmSync(mcpPath, { force: true }); } catch { /* best-effort */ }
      }
      // POLICY (D-25/RESEARCH §5): --strict-mcp-config is deliberate, not
      // incidental. Without it the operator's own ~/.claude.json servers are
      // silently inherited by every hive agent — one already running with
      // --permission-mode bypassPermissions would then hold tools the card
      // never showed, using the operator's own credentials. The cost is real
      // and recorded in the SUMMARY: an operator who relied on their personal
      // MCP servers inside hive agents loses them here and re-grants the
      // catalog equivalent per agent.
      //
      // T-P02-11-07: this MUST be tied to the provider being wired, NOT to
      // whether this agent happens to have anything armed. It used to sit
      // inside the non-empty branch above, so a freshly spawned agent with
      // zero grants — the DEFAULT state of every new agent, and the common
      // case — launched with neither flag and inherited the operator's
      // servers anyway. The mitigation was defeated in exactly the situation
      // it was written for. Pushing it unconditionally for a wired provider
      // is harmless when nothing is armed: it simply asserts "no servers
      // beyond what I was given", which with no --mcp-config means none.
      if (mcpWiredFor(meta.provider ?? 'claude')) args.push('--strict-mcp-config');
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
        // Revoke THE TOKEN THIS SPAWN WAS GIVEN, never whatever the map currently
        // holds. A restart is stopProxyBridge -> mintProxyToken -> spawn ->
        // proxyChildren.set, all synchronously in one tick, and this exit event is
        // asynchronous — so it ALWAYS lands after the replacement has minted. An
        // unguarded revokeProxyToken(agentId) here therefore kills generation 2's
        // credential every single time, not occasionally. Mirrors pty.ts's
        // releaseHookToken, which releases the credential the SESSION holds.
        // When a replacement already owns the entry, this generation's token was
        // revoked by stopProxyBridge on the way in — nothing is left to leak.
        if (this.proxyTokens.get(agentId) === token) this.revokeProxyToken(agentId);
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
    // The local document store (opt-in). To be exact about what it is, in the words
    // of its own core: retrieval is KEYWORD SCORING OVER TEXT CHUNKS — term
    // frequency plus a title/phrase boost — not entities, edges, or a graph
    // (src/main/kg-core.cjs). A retired capability name presented as live is a
    // false claim the agents themselves consume.
    // Volatile-free: the bundled-node launcher and the store's CLI are both fixed
    // absolute paths for an install, so baking them keeps the prefix
    // prompt-cache-stable while making the command runnable in cmd.exe/PowerShell
    // as well as a POSIX shell.
    const hiveNode = this.nodeCommand();
    const kgCli = kgCliPath || (process.platform === 'win32' ? '%KG_CLI%' : '$KG_CLI');
    const knowledgeLine = knowledgeGraph
      ? `Enterprise knowledge: this organisation has a private Knowledge Graph of its own documents, policies, and business context. When a task needs that context — company-specific facts, house style, internal processes — query it instead of guessing: run \`"${hiveNode}" "${kgCli}" search "<query>"\` for ranked passages, \`"${hiveNode}" "${kgCli}" list\` to see what is available, and \`"${hiveNode}" "${kgCli}" get <id>\` for a full document. (That first path is the harness's bundled Node — use it instead of bare \`node\`, which may not be on your PATH.)`
      : '';
    const godLine = meta.isGod
      ? 'You are the GOD / ORCHESTRATOR of this hive — your job is to ORCHESTRATE, not to implement: maintain live situational awareness and delegate the work. (1) AWARENESS — always know what is going on: keep an accurate picture of every agent (active vs archived/idle), the task board, and all in-flight work; drain your inbox continually and triage every other agent\'s requests, answering clarifications so the team runs autonomously. (2) DELEGATE — decompose work and fan it out to the hive agents via their inboxes (route messages and assign owners; do not do their jobs); do NOT take on grunt implementation yourself. Stay aware of who is already on the floor and delegate OPPORTUNISTICALLY: BEFORE you spawn anything, CHECK THE LIVE ROSTER (active agents in registry.json + their state in fleet.json) and prefer routing to an EXISTING agent that fits — above all when the request names one ("ask Pam to…", "have Jim…"), route to that agent instead of reflexively creating a new one. Reuse an idle or already-running agent whose role matches; only spawn a fresh agent when no existing one is a sensible fit, and say that you checked. One capable owner beats a duplicate. (3) OWN ONLY THE IMPORTANT, high-leverage things — task decomposition, dispatch decisions, sign-offs, conflict resolution, branch integration, and final QA — and remain the sole scribe of board.md. You are otherwise fully autonomous — there is NO separate approval queue. For the genuinely critical (destructive actions, spending real money, scope changes, unresolvable conflicts), ask the human directly in your own session and let the tool-permission prompt gate the action; the human approves natively, including remotely from their phone via /remote-control. Keep the team unblocked. When you DISPATCH a task, write it as a 4-part contract so the agent can run autonomously: (1) OBJECTIVE — the concrete goal; (2) OUTPUT — the expected deliverable/format; (3) TOOLS — what to use or avoid, and any references to read instead of re-deriving; (4) BOUNDARIES — scope limits + the definition of done. Pass references (file paths, message ids, board sections), not pasted content — keep dispatches short.'
        + ` MONITOR the floor by reading ${inRoot('fleet.json')} (live per-agent tokens, cost, status, last tool, breaker level, inbox backlog) and ${inRoot('registry.json')} — note that running 'claude agents' will NOT list your hive's sibling agents. A full Claude Code command reference is at ${inRoot('COMMANDS.md')} (slash commands act ONLY on your own session; CLI commands run in your shell and can target the fleet). You periodically receive scheduler / "Heartbeat" standup requests — on each, review every agent via fleet.json, re-engage anyone stalled, over-budget, or breaker-armed, and keep board.md and tasks.json accurate. NEVER edit tasks.json with your Write tool — it has several concurrent writers (you, the kanban UI, inbound webhooks and Slack), so writing back a copy you read a minute ago ERASES whatever landed in between, including answers the human just gave. Mutate ONE card at a time with \`"${hiveNode}" "${inRoot('bin', 'task.cjs')}" {add|patch|claim|done}\`, which compare-and-swaps on the ledger revision (full usage in PROTOCOL.md). ALWAYS set each task's "assignee" to the worker's agent id the moment you dispatch it, and NEVER clear it on status changes — a done card must still say who did the work (the human reads the board by who-did-what). HUMAN FEEDBACK is first-class in the ledger: when a task can only proceed with the human's input — a QUESTION to answer OR an ACTION only the human can perform (create an account, approve a purchase, provide credentials/screenshots, test on their device) — run \`task.cjs patch <id> --q "<the ask>"\`, which appends to the card's "humanQA" history and blocks it (phrase actions as clear to-dos; every past entry is kept — the history documents the card's decisions). The harness surfaces open questions on the office floor's ASK ME board; \`--q\` automatically records the asking agent as "askedBy" (from your AGENT_ID) — the human's answer lands in the same entry ("a") and is delivered to the inbox of whichever agent asked it. You always receive your own copy of every answer too, and YOUR copy is the one that carries the unblock: read it, act on it, and set the card's status yourself — the asker resumes its own work and must not touch the card's status. Do NOT park human questions in separate files (no HumanQuestion.md) and never sit waiting on the human in your own session. Steward the token budget.`
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
      // if main's queue refuses it, bounce to god to relay. God is exempt
      // (the bounce target).
      if (t !== godId && !canReceiveInbox(reg.agents[t]?.provider)) {
        if (!this.terminalHandoff(msg, t)) {
          this.deliver({
            ...msg,
            to: godId,
            subject: `[undeliverable — "${t}" runs ${reg.agents[t]?.provider ?? 'a hookless CLI'} and main's queue refused the terminal handoff (unknown/archived agent, queue full, or no harness home); relay this to it] ${msg.subject}`
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
        if (!this.terminalHandoff(msg, t)) {
          this.deliver({
            ...msg,
            to: godId,
            subject: `[undeliverable — "${t}" runs ${reg.agents[t]?.provider ?? 'a proxy-tier CLI'} and main's queue refused the terminal handoff (unknown/archived agent, queue full, or no harness home); relay this to it] ${msg.subject}`
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

  /** Non-Claude providers cannot drain hive inbox; hand direct mail to main's
   *  queue as a terminal work order for the target PTY (D-11 gap 1 — this
   *  used to hand it to the renderer over `emit`, which returned `false` with
   *  no window and bounced the mail to god blaming a missing UI that was
   *  never the true cause; main is now the one place typing into a terminal
   *  ever happens, ADR-0001, so it is the one place this hands off to). */
  private terminalHandoff(msg: HiveMessage, targetId: string): boolean {
    // `delivered` now means "main's queue accepted it", not "the renderer
    // took it" — the durable log's `kind: 'terminal-handoff'` shape and its
    // `delivered` field are unchanged; only what `delivered` MEANS changed.
    const delivered = this.handoff?.({
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
          // STRIP THE BOM BEFORE PARSING. Windows agents write their outbox with
          // PowerShell, and `Set-Content` / `Out-File -Encoding utf8` emit a UTF-8
          // BOM (U+FEFF) by default there. JSON.parse rejects a leading BOM, so
          // every message a Windows worker sent the obvious way landed in the
          // catch below and was thrown away. Measured live: TWO of Jim's reports
          // — the round-trip completion and a blocked-task finding — were both
          // quarantined, and god's inbox simply stayed empty.
          //
          // The BOM is not corruption and carries no meaning in JSON: stripping it
          // is what every tolerant reader does. Fixing it here fixes it for every
          // engine on every platform, rather than asking eleven CLIs to remember
          // an encoding flag.
          const raw = readFileSync(full, 'utf8').replace(/^﻿/, '');
          const partial = JSON.parse(raw) as Partial<HiveMessage>;
          const msg = this.normalize(partial, id);
          msg.from = id; // sender is authoritative — the owning directory
          this.routeMessage(msg);
          renameSync(full, join(outbox, '.sent', f)); // archive, don't reprocess
          routed++;
        } catch (e) {
          // Malformed file — quarantine so we don't spin on it. But NEVER silently:
          // this is a mail system, and a message that vanishes with no log and no
          // bounce is worse than one that fails loudly. The sender believed it sent;
          // the recipient never knew to expect it; and the only evidence was a
          // `bad-*.json` nobody reads. That is exactly how Jim's two reports were
          // lost before the BOM strip above existed.
          const why = e instanceof Error ? e.message : String(e);
          console.error(`[hive] DROPPED malformed outbox message ${id}/${f}: ${why}. `
            + `Quarantined as .sent/bad-${f}; the sender was NOT told.`);
          try { renameSync(full, join(outbox, '.sent', `bad-${f}`)); } catch { /* noop */ }
          // Bounce to the sender so the failure reaches whoever can fix it — the
          // agent that wrote the file. Best-effort by construction: if the bounce
          // itself cannot be delivered the log line above is still the record.
          try {
            this.routeMessage(this.normalize({
              to: id,
              act: 'inform',
              subject: `Your message ${f} could not be delivered`,
              body: `The hive router could not parse ${f} and has quarantined it as `
                + `.sent/bad-${f}. It was NOT delivered to anyone.

Parser said: ${why}

`
                + 'If you wrote it from PowerShell, use '
                + '[System.IO.File]::WriteAllText(path, json, (New-Object System.Text.UTF8Encoding $false)) '
                + '— Set-Content and Out-File -Encoding utf8 add a BOM. Rewrite the message and send again.'
            }, 'system'));
          } catch { /* the log line above is the record */ }
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
    if (!isSafeAgentId(id)) return ''; // IPC-01: renderer-supplied; fail closed, never throw across IPC
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
    if (!isSafeAgentId(id)) return false; // IPC-01
    const p = join(this.agentDir(id), 'memory.md');
    if (!existsSync(p)) return false;
    try {
      // A fresh seed is ~90 chars (one header line + the prompt). Anything
      // meaningfully longer means the agent appended durable facts.
      return readFileSync(p, 'utf8').trim().length > 200;
    } catch { return false; }
  }
  inbox(id: string): HiveMessage[] {
    if (!isSafeAgentId(id)) return []; // IPC-01: reachable from the renderer via `hive:inbox`
    return this.listMessages(join(this.agentDir(id), 'inbox'));
  }
  /** Read an agent's OUTBOX (messages it has authored/sent). Symmetric with
   *  inbox(); the router drains live outbox files into recipients' inboxes and
   *  archives the original under outbox/.sent, so a sent message survives there. */
  outbox(id: string): HiveMessage[] {
    if (!isSafeAgentId(id)) return []; // IPC-01
    return this.listMessages(join(this.agentDir(id), 'outbox'));
  }

  /** Catalog ids actually armed in `<agentDir>/mcp.json` RIGHT NOW — what the
   *  RUNNING session got, read straight off disk. This is the fact half of
   *  D-29's `granted` vs `armed` split: nothing hot-reloads, so `mcp:agentState`
   *  reports both and the renderer computes `pending · restart` from the
   *  difference — main never asserts a live connection. `[]` when the file is
   *  absent or unparseable; never throws. */
  mcpArmed(agentId: string): string[] {
    // MAIN-02: `agentId` arrives here straight from the RENDERER (mcp:agentState),
    // and a `typeof agentId === 'string'` shape check is not a membership check —
    // `../agents/<someone-else>` is a perfectly good string. Validate against the
    // live registry BEFORE constructing any path, so an id the roster never issued
    // cannot be used to read a `mcpServers` key list off an arbitrary JSON file.
    // Fails closed on a hive with no home too: `registry()` answers `{ agents:{} }`
    // there, which also keeps `agentDir`'s `root()!` non-null assertion — a
    // compile-time fiction — from throwing a TypeError across a sync IPC handler.
    if (!this.registry().agents[agentId]) return [];
    const p = join(this.agentDir(agentId), 'mcp.json');
    if (!existsSync(p)) return [];
    try {
      const parsed = JSON.parse(readFileSync(p, 'utf8')) as { mcpServers?: Record<string, unknown> };
      return Object.keys(parsed.mcpServers ?? {}).map((k) => k.replace(/^hellomarkx-/, ''));
    } catch {
      return [];
    }
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
    // IPC-01: `opts.agentId` reaches here from the renderer via `hive:messages`
    // and is about to become `join(root,'agents',<id>)`. Fail closed.
    if (onlyAgent && !isSafeAgentId(onlyAgent)) return [];
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
    if (!isSafeAgentId(id)) return 0; // IPC-01
    const dir = join(this.agentDir(id), 'inbox');
    if (!existsSync(dir)) return 0;
    try { return readdirSync(dir).filter((f) => f.endsWith('.json')).length; } catch { return 0; }
  }
  // installAgyHooks, installCodexHooks, installPiHooks, installOpenCodePlugin,
  // installCrushConfig and installGrokHooks moved to hiveProvisioning.ts
  // (STRUCT-02, plan 02-01) as free functions taking their inputs explicitly.
  // See the bootstrap-seam call sites above for the imports.

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
        // capabilityLine()'s first production consumer (D-30). Gated TWICE: on
        // isAgentProvider (providerPreset silently falls back to claude's own
        // capabilities for an unrecognised string — no claim beats a wrong
        // claim) and on the engine actually HAVING a gap, so a fully-capable
        // floor renders byte-for-byte what it rendered before this line
        // existed. Never touches injectedPrompt() — see this method's own doc
        // above for why that seam must stay volatile-free.
        // ponytail: emitted per row, one clause per gapped engine per prompt —
        // dedupe to first-mention-per-engine or move to the legend if a
        // measured roster (see 02-08-SUMMARY.md) ever crowds the MAX=24 cap.
        if (isAgentProvider(engine)) {
          const c = providerCapabilities(engine);
          if (!c.mail || c.spend === 'none' || !c.compact || !c.remote) bits.push(capabilityLine(engine));
        }
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
  private writeJson(p: string, data: unknown, mode?: number): void {
    this.atomicWriteJson(p, data, mode);
  }
  private atomicWriteJson(p: string, data: unknown, mode?: number): void {
    const tmp = `${p}.tmp-${shortRand()}`;
    // `mode`, when given, goes on the TEMP file — integrations.ts:104-108's
    // reasoning, copied verbatim: a credential (mcp.json) must never be
    // briefly world-readable under its final name between write and rename.
    writeFileSync(tmp, JSON.stringify(data, null, 2), mode !== undefined ? { encoding: 'utf8', mode } : 'utf8');
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

  /** Delegates to {@link GitCommitter.commit} — ADR-0004: this class owns the
   *  hive's only committer instance (`this.committer`, constructed above).
   *  The debounce, retry/backoff and FLOOR-04 secret scrub live in
   *  gitCommitter.ts now; this stays a public one-line call so every existing
   *  caller (the router tick, writeTasks(), ensureAgent(), setArchived(), …)
   *  is unaffected. */
  commit(message: string): void {
    this.committer.commit(message);
  }

  /** Delegates to {@link GitCommitter.flushCommit} — the real debounced
   *  commit body now lives in gitCommitter.ts. Kept `private` here on
   *  purpose: TypeScript's `private` is compile-time only, and
   *  test/hive-durability.test.cjs and test/engine-parity.test.cjs call this
   *  exact method, by this exact name, at runtime six times — driving "the
   *  real debounced commit body, synchronously". Moving the visibility or
   *  the name would break all six. */
  private flushCommit(root: string): Promise<void> {
    return this.committer.flushCommit(root);
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