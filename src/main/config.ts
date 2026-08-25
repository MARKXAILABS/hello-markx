import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import {
  autoModeFlagForProvider,
  defaultCommandForProvider,
  inferAgentProvider,
  providerPreset,
  sandboxFlagsForProvider,
  type AgentProvider
} from '../shared/agentProvider';
import { defaultMcpDefaults, MCP_CATALOG, MCP_GRANT_PREFIX } from '../shared/mcpCatalog';
import { expandTilde, normalizeHiveHome } from './fs';
import { DEFAULT_HOST_ALLOWLIST } from './commandShape';
import { PersistStore } from './db';
import { deleteSecret, deleteSecretsWithPrefix, getSecret, setSecret } from './integrations';
import type { ClaudeAccount } from '../shared/claudeAccounts';
import type { IntegrationRecord } from '../shared/integrations';
import { secretRefFor } from '../shared/integrations';
import {
  DEFAULT_CONTEXT_TRIGGER,
  DEFAULT_ORG_TRIGGER,
  DEFAULT_TRIGGER_MODE,
  DEFAULT_WEBHOOK_SCHEMA,
  type ContextTriggerConfig,
  type OrgTriggerConfig,
  type WebhookTrigger
} from '../shared/triggers';

/** A recurring auto-dispatched mission fired on an interval by the scheduler. */
export interface ScheduledMission {
  id: string;
  label: string;
  intervalMs: number;
  to: string;
  body: string;
  enabled: boolean;
  /** When true, the scheduler asks the renderer to compact live terminals when
   *  this mission fires — but only agents whose context has filled past the bar
   *  in `contextTrigger.compact` (60% by default, 40% on ~1M-token windows), so
   *  small/idle sessions are left alone instead of compacting on every tick.
   *
   *  This gate used to be described here but was never actually implemented: every
   *  live agent was compacted on every tick. It is real now, and the bars live in
   *  `ContextTriggerConfig` where the operator can edit them, so do not restate
   *  the numbers anywhere else — they will drift. */
  autoCompact?: boolean;
  lastFiredAt?: number;
  /** Mission flavor. Absent ⇒ 'dispatch' (the classic interval-dispatch mission,
   *  e.g. the ops standup). 'heartbeat' (Lane A #1) is a context-aware beat: it
   *  observes live floor state, re-engages a quiet god, and ticks the circuit
   *  breaker — armed with an adaptive cadence, not a fixed setInterval. */
  kind?: 'dispatch' | 'heartbeat' | 'compact';
  /** Heartbeat only: a floor is "quiet" when no tracked signal (log.jsonl mtime,
   *  inbox/outbox mtimes, any PTY output) has moved in this many ms. Default
   *  ~5 min. NOT derived from registry.status (which never transitions in main). */
  quietThresholdMs?: number;
}

/** The built-in hourly ops standup: god reviews who's doing what + whether tasks
 *  are on track and agents are running, and every terminal's context is compacted.
 *  Shipped enabled by default; users can toggle it off in the Command Center. */
export const OPS_STANDUP_MISSION: ScheduledMission = {
  id: 'ops-standup',
  label: 'Hourly ops standup',
  intervalMs: 3_600_000,
  to: 'god',
  body:
    'Hourly ops standup. Review every agent: who is doing what, and confirm each ' +
    'is still running (not stalled or idle-stale). Check the task board — are ' +
    'in-flight tasks on track, and is anything blocked or unowned? Flag stale ' +
    'agents and at-risk tasks, and keep the board accurate. (As part of this ' +
    "standup each working agent is asked to summarise its current task and the " +
    'next step, then compact and resume from the same point — so terminal ' +
    'contexts stay bounded without losing work. The compaction is queued and ' +
    'runs when an agent is idle, so it never interrupts work mid-step.)',
  enabled: true
  // NO autoCompact. Compaction belongs to contextTrigger.compact and nothing else.
  // This flag used to live here as well, which meant a default install asked for
  // compaction on TWO cadences — hourly from this standup and 2-hourly from the
  // trigger — the exact "two controls that disagree" the maint-1 retirement below
  // was written to end. The standup's own prose still describes compaction, and
  // that stays true: the trigger does it, just not on this mission's clock.
};

/** The built-in heartbeat (Lane A #1). A context-aware beat that, each tick,
 *  observes live floor state and — only when the floor has gone quiet — drops a
 *  digest into god's inbox and (if god's PTY is genuinely idle) nudges it to
 *  re-engage anyone stalled. The same beat ticks the circuit breaker.
 *
 *  Shipped DISABLED by default (opt-in): unlike the standup, which only sends a
 *  hive message, the heartbeat types into god's PTY, so the user turns it on
 *  explicitly in the Command Center once they want active re-engagement.
 *  `intervalMs` is the normal-cadence base; the scheduler derives a tighter beat
 *  when an agent looks stuck and a slower one right after a re-engage. */
export const HEARTBEAT_MISSION: ScheduledMission = {
  id: 'heartbeat',
  label: 'Floor heartbeat',
  intervalMs: 120_000,
  to: 'god',
  body:
    'Floor heartbeat: the team has gone quiet. Review the digest in your inbox, ' +
    're-engage anyone stalled or blocked, and keep the board accurate — or rest ' +
    'if the work is genuinely done.',
  enabled: false,
  kind: 'heartbeat',
  quietThresholdMs: 300_000
};

/** The dedicated auto-compact MAINTENANCE schedule (maint-1). DECOUPLED from the
 *  ops standup so editing/replacing a standup can never silently disable
 *  compaction again (the bug this fixes). It fires ONLY the auto-compact signal —
 *  `kind:'compact'` makes syncMissions skip the hive.send dispatch (empty to/body).
 *  Shipped DISABLED (v0.3.4 founder decision): scheduled compaction is opt-in.
 *  Turn it on in Settings → General or the Schedules tab; the Schedules warning
 *  panel explains the risk of leaving it off for long-running agents. It is the
 *  SINGLE source of truth for compaction, and it's persistent: deleting it makes
 *  it reappear DISABLED.
 *  Existing installs keep whatever enabled state the user already has
 *  (compactMaintenanceSeeded guards re-seeding). */
export const COMPACT_MAINTENANCE_MISSION: ScheduledMission = {
  id: 'compact-maintenance',
  label: 'Auto-compact (maintenance)',
  // 2h, matching DEFAULT_CONTEXT_TRIGGER.compact.everyMs. The two cadences must
  // agree: this mission is the schedule half of the same behaviour the context
  // trigger now owns, and a 1h seed here would keep interrupting agents on the
  // old rhythm no matter what the trigger says.
  intervalMs: 7_200_000,
  to: '',
  body: '',
  enabled: false,
  autoCompact: true,
  kind: 'compact'
};

/** The 1h cadence `compact-maintenance` was seeded with before Triggers doubled
 *  it. `migrateTriggersV1` bumps only missions still sitting on this EXACT value,
 *  so an interval the user tuned by hand is left exactly where they put it. */
const LEGACY_COMPACT_MAINTENANCE_INTERVAL_MS = 3_600_000;

/** Circuit-breaker thresholds (Lane A #6.6b). The breaker runs inside the
 *  heartbeat beat, so it only ticks when the heartbeat is enabled. Trip
 *  conditions are behavioral by default; `costCapUsd` is the only $-based one and
 *  is unset by default (a hardcoded dollar default would be arbitrary). Defaults
 *  are deliberately conservative and steer-first — `hardStop` is OFF unless the
 *  user opts in, so the breaker never auto-kills a healthy long-runner. */
export interface CircuitBreakerConfig {
  /** Master switch for breaker evaluation within the beat. Default true. */
  enabled?: boolean;
  /** Allow the top of the ladder (kill PTY + archive). Default false = the
   *  breaker may steer/constrain but never hard-stops until the user opts in. */
  hardStop?: boolean;
  /** Consecutive identical tool calls (same name+input) before tripping. */
  repeatedToolLimit?: number;
  /** Consecutive api_error / retry events before tripping. */
  errorStormLimit?: number;
  /** Output-token velocity (tokens/min, diffed across beats) before tripping. */
  tokenVelocityPerMin?: number;
}

/** Document keyword store (multimodal context store + agent access tool).
 *  Retrieval is KEYWORD SCORING OVER TEXT CHUNKS — term frequency plus a
 *  title/phrase boost, no entities and no edges — per `src/main/kg-core.cjs`'s
 *  own header. It is not a graph, and the entity graph (V2-05) was RETIRED.
 *  The user ingests their own documents/images/PDFs; agents query them on demand
 *  via the `kg` CLI. Opt-in like the heartbeat/Slack features — `enabled` gates
 *  everything (no env injected, no prompt line, no store touched when off). See
 *  docs/design/knowledge-graph.md. */
export interface KnowledgeGraphConfig {
  /** Master switch. Default false = zero behaviour change (the feature is dark). */
  enabled?: boolean;
  /** Override the store location. Unset = <userData>/knowledge. */
  rootPath?: string;
}

export interface HarnessConfig {
  /** Has the user completed the first-run onboarding? */
  onboardingComplete: boolean;
  /** Self-identified audience picked on the first onboarding screen. Drives the
   *  copy register everywhere onboarding explains itself: 'technical' shows CLI /
   *  flag lingo, 'non-technical' explains each concept in plain language. Unset =
   *  not yet chosen (treated as technical for any incidental copy). */
  audience?: 'technical' | 'non-technical';
  /** Folder where the harness keeps its own state (agent metadata, logs). */
  harnessHome: string | null;
  /** Recently-opened hive home folders (most-recent first), surfaced by the
   *  launch-time hive picker. Maintained by writeConfig whenever harnessHome is
   *  set (onboarding finish, changeHome). Capped to a handful. */
  recentHives?: string[];
  /** Folders the user registered during onboarding (used as quick-picks). */
  registeredRepos: string[];
  /** When true — and it is TRUE BY DEFAULT — every new agent is spawned with its
   *  engine's "stop asking me" flag: `--permission-mode bypassPermissions`
   *  (claude/grok), `--dangerously-bypass-approvals-and-sandbox` (codex),
   *  `--yolo` (qwen/crush), `--dangerously-skip-permissions` (agy). See
   *  `commandForAutoMode` below for the one place that appends it.
   *
   *  Say it plainly, because HIVE.md §2.3 and PROTOCOL.md still describe the
   *  tool-permission prompt as "the HITL gate" (#4): with autoMode on there IS no
   *  prompt, so there is no human in the loop. The gate has to be a standing
   *  `permissions.deny` block in the per-agent settings the hive writes — that
   *  list applies UNDER a bypass, and it is the only thing between a worker and
   *  `rm -rf` / `git push --force` / `curl | sh`. This flag must also be visible
   *  on the agent card and in onboarding rather than silently on. */
  autoMode: boolean;
  /** The command we run when spawning a new agent. */
  defaultCommand: string;
  /** Default model for newly spawned agents (e.g. 'claude-sonnet-4-6[1m]'); unset = CLI default. */
  defaultModel?: string;
  /** Which provider powers the GOD orchestrator ("Michael"). The persona is
   *  constant; only its engine is selectable. Default 'claude'. Eligible providers
   *  are those that can receive inbox (claude/codex/antigravity/qwen). */
  godProvider?: AgentProvider;
  /** The model GOD runs on. Unset falls back to the provider preset's
   *  `recommendedOrchestratorModel`, then MODEL_GOD. Default 'claude-opus-4-8'. */
  godModel?: string;
  /** Per-server consent state for the default MCP bundle, keyed by catalog id.
   *  Seeded from MCP_CATALOG (safe-readonly ON, write/secret OFF); the user flips
   *  these in Settings. FLOOR-WIDE, and — since `migrateMcpConsentV1` — read only
   *  for the `safe-readonly` tier (D-27); `write`/`secret` entries here are
   *  inert leftovers a pre-migration config may still carry. */
  mcpDefaults?: { [id: string]: { enabled: boolean } };
  /** Per-AGENT consent for `write`/`secret` MCP servers (D-27) — the safe tier
   *  stays floor-wide in `mcpDefaults` above; no per-agent override of the safe
   *  tier exists. The secret itself lives in the encrypted store and is NEVER
   *  here: the ref is always DERIVED, `secretRefFor(mcpGrantKey(agentId, mcpId))`,
   *  so `mcp:grant`, `mcp:revoke` and `resetConfig`'s sweep cannot key an
   *  agent-server pair three slightly different ways (D-28). `grantedAt` is a
   *  display-only timestamp — nothing reads it to decide anything. */
  mcpAgentGrants?: { [agentId: string]: { [mcpId: string]: { enabled: boolean; grantedAt: number } } };
  /** One-time guard for `migrateMcpConsentV1` (drops any floor-wide `enabled:true`
   *  on a write/secret `mcpDefaults` entry — D-27 makes that tier per-agent, and
   *  the migration does NOT invent a per-agent grant from what it drops; the
   *  operator re-grants explicitly, per agent, fail closed). */
  mcpConsentMigratedV1?: boolean;
  /** Enable semantic memory (MemPalace CLI). No-op if mempalace isn't installed. */
  semanticMemory: boolean;
  /** Embedding model for the palace: lightweight 'minilm' or multilingual 'embeddinggemma'. */
  embeddingModel: 'minilm' | 'embeddinggemma';
  /** Recurring auto-dispatch missions handled by the scheduler. */
  missions?: ScheduledMission[];
  /** One-time guard: has the built-in hourly ops standup been seeded into an
   *  existing install's missions? Prevents re-adding it after a user deletes it. */
  opsStandupSeeded?: boolean;
  /** One-time guard for the built-in heartbeat mission (mirrors opsStandupSeeded
   *  so a user who deletes the heartbeat doesn't get it re-added every boot). */
  heartbeatSeeded?: boolean;
  /** maint-1 guard for the dedicated auto-compact maintenance mission. UNLIKE the
   *  two above, this does NOT suppress re-add forever: once seeded (flag set), a
   *  later delete makes the mission reappear DISABLED on next boot (compaction is
   *  required, so it's never silently lost — only user-disabled). */
  compactMaintenanceSeeded?: boolean;
  /** DEPRECATED (v0.3.4): config-file only, no UI anywhere. Hard dollar ceiling
   *  across all active agents. Still enforced if present so legacy configs keep
   *  their guard, but the token cap (costCapTokens) is the real budget —
   *  scheduled for removal next release. */
  costCapUsd?: number;
  /** Hard TOKEN ceiling (total tokens across all active agents) before the
   *  breaker trips. The user-facing budget — set in Settings. Opt-in like the
   *  $-cap; total = input + output + cacheRead + cacheCreation, summed across the
   *  floor (the biggest token spender is blamed). */
  costCapTokens?: number;
  /** Per-agent total-token ceiling, keyed by agent id. When an agent's own total
   *  tokens exceed its cap the breaker trips that agent alone (independent of the
   *  floor budget). Set from each agent's card in the Command Center. */
  agentTokenCaps?: Record<string, number>;
  /** Agent ids whose automatic inbox/queue delivery is paused. Pending messages
   *  stay durable until the operator explicitly resumes delivery. */
  autoDeliveryPausedAgents?: string[];
  /** Passed to every spawned agent as `--max-turns <n>` when set; unset = no cap
   *  (Claude Code's default). A coarse runaway guard independent of the breaker. */
  maxTurns?: number;
  /** Max concurrent god-triggered ephemeral Slack workers; extra spawn-requests
   *  wait in the queue (natural backpressure, a resource backstop). Default 4. */
  maxConcurrentWorkers?: number;
  /** Minutes an ephemeral worker may produce NO output before the reaper kills it
   *  — idle-based, never wall-clock, so an actively-working worker is never reaped.
   *  Default 20. */
  workerIdleTimeoutMinutes?: number;
  /** Registered integrations (Phase 2) — labeled REST endpoints workers reach through
   *  the loopback secret broker. METADATA ONLY: each record carries a `secretRef`
   *  handle, never the secret value (secrets live encrypted in a separate file via
   *  Electron safeStorage — see src/main/integrations.ts). Default []. */
  integrations?: IntegrationRecord[];
  /** Default per-worker TOTAL-token cap (input+output+cache) applied to every
   *  god-triggered ephemeral worker; a worker's own spawn-request `tokenCap`
   *  overrides it. When the effective cap is exceeded the worker is reaped (its
   *  committed work preserved) and god is informed. This is PLUMBING for a later
   *  budget feature: per the human directive there is NO per-worker cap today, so
   *  the default is 0 = UNLIMITED — the mechanism is wired but never throttles
   *  unless someone explicitly sets a positive cap (per request or here). */
  defaultWorkerTokenCap?: number;
  /** Circuit-breaker thresholds (Lane A #6.6b). Unset = conservative defaults. */
  circuitBreaker?: CircuitBreakerConfig;
  /** Document keyword store (multimodal context for agents). Default OFF. */
  knowledgeGraph?: KnowledgeGraphConfig;
  /** Fire native desktop notifications on agent lifecycle events (idle finish / waiting for input). */
  notifications?: boolean;
  /** Opt-in "strong keep-alive": while ≥1 agent PTY is live, escalate the power
   *  blocker from 'prevent-app-suspension' to 'prevent-display-sleep', which on
   *  macOS also blocks TRUE system sleep (lid-close/idle) so scheduled missions
   *  and terminals keep firing ON TIME while away — at a battery cost (best on
   *  AC). Default OFF: the honest default is "survive sleep + catch up once on
   *  resume" (see the powerMonitor 'resume' handler), not "stay awake". */
  strongKeepalive?: boolean;
  /** Auto-update from GitHub releases (v0.3.4). Default ON. Packaged builds
   *  check on boot + every ~6h, download in the background, and show a
   *  "restart to update" toast — installation is always user-initiated. OFF
   *  disables checking entirely. (Mirrored in preload + renderer config.) */
  autoUpdate?: boolean;
  /** Multi-window "floors": expose a New Floor action that opens additional
   *  windows, each an independent office with isolated renderer state (its own
   *  session partition) and per-window PTY routing. ON by default (v0.3.4: code
   *  and comment disagreed; the shipped behavior — enabled — wins) —
   *  the window/PTY-ownership plumbing is always active and single-window-safe,
   *  but the New Floor entry points (app menu item + IPC) only appear when on.
   *  The on-disk hive (god orchestration under harnessHome) stays process-global;
   *  floors share it. */
  multiWindow?: boolean;
  /** Terminal theme — mirrored into each agent's per-session Claude settings
   *  ("theme" key) at spawn so the TUI's truecolor palette matches. Scoped to
   *  harness agents only; the user's global Claude theme is never touched. */
  terminalTheme?: 'light' | 'dark';
  /** Anonymous product analytics (PostHog) — the exact events/properties are
   *  documented in TELEMETRY.md. Default ON (opt-out, like autoUpdate); builds
   *  without an injected key and environments with DO_NOT_TRACK set never send
   *  regardless of this flag. (Mirrored in preload + renderer config.) */
  telemetryEnabled?: boolean;
  /** Master flag for the TV-show office themes feature (Settings theme picker +
   *  destructive switch flow). Default false = the picker is hidden and the
   *  office renders as today (zero behavior change). */
  tvShowOffices?: boolean;
  /** Which office map/cast theme the pixel office renders. Only honored when
   *  `tvShowOffices` is on; otherwise the office theme is used. Unbuilt show
   *  themes fall back to 'office' in the loader. */
  officeTheme?: 'office' | 'friends' | 'brooklyn99' | 'siliconvalley' | 'got' | 'hogwarts';
  /** Claude account pool (v0.4.5) — NON-SECRET metadata only: {id, label,
   *  createdAt} per registered subscription account. The setup-token itself is
   *  stored write-only in the secret broker under `claude-account:<id>`
   *  (integrations.ts, safeStorage) and materialized MAIN-ONLY at spawn as
   *  CLAUDE_CODE_OAUTH_TOKEN. Agents reference an account by id
   *  (AgentMeta.account); unset = the machine's `/login` account. */
  claudeAccounts?: ClaudeAccount[];
  /** Which pool account powers the GOD orchestrator ("Michael"). Unset = the
   *  machine's `/login` account. Mirrors AgentMeta.account for workers — Michael
   *  is spawned by useHive from config, so his pin lives here. */
  godAccount?: string;
  /** Michael's assignment policy: `'auto'` = the pool picks the least-loaded
   *  healthy account at every spawn (godAccount then holds the last resolved
   *  account); unset = pinned to godAccount / the login account. */
  godAccountPolicy?: 'auto';
  /** Per-CLI-provider local/self-hosted base URL (Ollama/LM Studio/vLLM, …) for the
   *  OpenCode/Crush/pi/qwen engines; applied at spawn (config-injection or proxy
   *  upstream). API KEYS are NOT stored here — they live write-only in the secret
   *  broker (integrations.ts), read MAIN-ONLY at spawn. */
  providerBaseUrls?: Partial<Record<AgentProvider, string>>;
  /** Per-CLI-provider default model slug, used to pre-fill the model picker. */
  providerDefaultModels?: Partial<Record<AgentProvider, string>>;
  /** GATE-04 / D-15. Per-CLI-provider sandbox opt-in. ABSENT === OFF, which is the
   *  behaviour that shipped and therefore the verified fallback — no migration, no
   *  explicit write. Only engines whose preset declares `sandboxFlags` can act on it
   *  (codex alone today); it is inert for the rest. Mirrors the renderer store. */
  providerSandbox?: Partial<Record<AgentProvider, boolean>>;
  /** Master toggle for the Slack → Michael's-queue integration. */
  slackEnabled?: boolean;
  /** Slack app signing secret (Basic Information → Signing Secret). Never logged. */
  slackSigningSecret?: string;
  /** Bot token (xoxb-…) — only needed if the bot ever replies; optional for now. */
  slackBotToken?: string;
  /** Restrict ingestion to one channel id; empty/undefined = any channel. */
  slackChannelId?: string;
  /** Local HTTP port the webhook server binds to (default 3847). */
  slackPort?: number;
  /** Opt-in: allow APP/VOICE-INITIATED proactive posting into Slack (e.g. the
   *  renderer's "queued" acknowledgement). DEFAULT OFF per the human directive
   *  "stop posting into Slack by default". This does NOT gate the Slack-ORIGIN
   *  done-reply round-trip (a user @-mention → task → result posted back to that
   *  thread) or an agent's own direct in-thread reply — those always stay on. */
  slackProactivePosting?: boolean;

  // ─── Free Flow (voice dictation → message queue) ───────────────────────────
  /** Master toggle for Free Flow push-to-talk dictation. Default OFF: with it off
   *  the composer shows no mic button, no getUserMedia runs, and no Groq call is
   *  ever made (zero behavior change). */
  freeflowEnabled?: boolean;
  /** User-pasted Groq API key (the user supplies their own free key). Used ONLY in
   *  the main process for the Groq STT call; NEVER logged, and never crosses IPC
   *  for the request. Treated like `slackBotToken`. */
  groqApiKey?: string;
  /** Groq Whisper model id. Default 'whisper-large-v3-turbo' (fast, multilingual). */
  freeflowModel?: string;

  // ─── Realtime Michael (premium speech-to-speech voice orchestrator) ─────────
  /** True ONLY while a Realtime Michael voice session is live: the renderer
   *  session flips this on at start() (before getUserMedia) and off at stop().
   *  The main-process mic permission gate reads it so the Electron media
   *  permission is open EXACTLY while the voice loop holds the mic — never just
   *  because an OpenAI key exists (that key is shared with the CLI engines).
   *  Default off; absence ⇒ mic denied, mirroring `freeflowEnabled`. */
  realtimeVoiceEnabled?: boolean;
  /** How long (ms) a realtime voice session may sit with no voice activity before
   *  it auto-disconnects (the rt-9 idle guard). Default 180000 (3 min). 0 = never
   *  auto-disconnect on idle — the spend cap remains the runaway guard. The user
   *  tunes this in Settings → Realtime Michael. */
  realtimeIdleDisconnectMs?: number;

  // ─── Generic inbound webhook + status API (LEGACY, single-endpoint) ─────────
  // Superseded by `webhookTriggers`, which allows many endpoints over one server
  // and one tunnel. These three are kept because they are the MIGRATION SOURCE
  // (`migrateTriggersV1` folds them into a `WebhookTrigger`) and because the main
  // process still reads them until the server is rewired onto the new list.
  // Nothing new should be written here.
  /** @deprecated Use `webhookTriggers[].enabled`. */
  webhookEnabled?: boolean;
  /** App-generated shared secret callers echo in `x-md-webhook-secret`. Never
   *  logged, and never forwarded into the routed message/card/response.
   *  @deprecated Use `webhookTriggers[].secret` (one secret per endpoint, so
   *  revoking one caller never disturbs the others). */
  webhookSecret?: string;
  /** Local HTTP port the generic webhook server binds to (default 3849).
   *  @deprecated The port is a property of the shared server, not of any one
   *  trigger; `webhookTriggers` are multiplexed over it by id. */
  webhookPort?: number;
  /** Master switch for the cloudflared public tunnel (DAEMON-05). OFF by
   *  default, and never set as a side effect of enabling Slack or a webhook
   *  endpoint — `start()` on either server opens no tunnel at all; a tunnel
   *  exists only where an operator explicitly presses the enable control.
   *  Turning this on puts an authenticated door onto this floor of
   *  bypassed-permission agent CLIs on the public internet. */
  tunnelEnabled?: boolean;

  // ─── Triggers (src/shared/triggers.ts owns every type here) ────────────────
  /** Auto-compaction / auto-clearing of agent terminal context. Both halves ship
   *  in DEFAULT_CONTEXT_TRIGGER; `readConfig` deep-fills them, because the
   *  top-level merge below is one level deep and a half-written sub-object would
   *  otherwise reach consumers with `undefined` thresholds. */
  contextTrigger?: ContextTriggerConfig;
  /** Inbound HTTP endpoints, one entry per caller. Replaces the legacy single
   *  webhook above; several coexist on one port, told apart by `id` in the path. */
  webhookTriggers?: WebhookTrigger[];
  /** Peer messaging between teammates' clone nodes. Persistence + UI only today —
   *  no transport service reads `apiKey` yet. */
  orgTrigger?: OrgTriggerConfig;
  /** One-time guard for `migrateTriggersV1` (legacy webhook → webhookTriggers,
   *  1h → 2h compact cadence). Set once the migration has run to completion. */
  triggersMigratedV1?: boolean;

  // ─── Memory reflection (the janitor's condense half) ───────────────────────
  /** Master toggle for the in-process MemoryReflector. Default on. */
  reflectEnabled?: boolean;
  /** How often to scan agent memory.md files for condensing (default 30 min). */
  reflectIntervalMs?: number;
  /** Condense when bytes exceed this percent of the 128 KB budget (matches the
   *  janitor's TRIGGER_PCT). DECIDED: 50. */
  reflectByteTriggerPct?: number;
  /** ...OR when `## ` section count exceeds this (AND bytes > floor). DECIDED: 50. */
  reflectSectionTrigger?: number;
  /** Newest K verbatim `## ` sections kept untouched on each condense. */
  reflectRecentKeep?: number;
  /** Never condense a file smaller than this; also the section-trigger byte floor.
   *  DECIDED: 16 KB. */
  reflectMinBytes?: number;

  // ─── GATE-02: the operator's env escape hatch ──────────────────────────────
  /** Additional `process.env` NAMES (never values) that agent spawns may inherit
   *  past the `allowFromEnv` allowlist in shellEnv.ts — e.g. `['CODEX_API_KEY']`
   *  for a BYOK engine whose key the operator exported in their own shell rather
   *  than configuring in the app. Config-file only, by design: it WIDENS a
   *  security boundary, so it should cost more than a checkbox. Default [].
   *  Reaches the child through `SpawnOptions.envPassThrough` at both of
   *  `spawnAgentCore`'s `ptyManager.spawn(` sites; `hiddenClaude.ts` and
   *  `memory.ts` cannot read it (shellEnv.ts ceiling item (h)). */
  envPassThrough?: string[];

  // ─── GATE-03: the outbound host allowlist ──────────────────────────────────
  /** The hosts an agent's commands may reach without the operator being asked —
   *  matched EXACTLY, after normalization, so `evil.github.com` does not inherit
   *  `github.com`. Defaults to `DEFAULT_HOST_ALLOWLIST` (commandShape.ts), which
   *  is marked `[ASSUMED]` and known incomplete: extend it here when a refusal
   *  names a host this floor legitimately needs.
   *
   *  EMPTYING IT IS A DECISION, not a reset. An operator who clears this list has
   *  said "no outbound hosts", and the judge denies every one of them rather than
   *  asking once per host at 3am. Deleting the KEY is a different fact — that is
   *  "not configured", and it takes the default above. */
  hostAllowlist?: string[];
}

const DEFAULTS: HarnessConfig = {
  onboardingComplete: false,
  harnessHome: null,
  recentHives: [],
  registeredRepos: [],
  // GATE-02: no name is re-admitted unless the operator names it themselves.
  envPassThrough: [],
  // GATE-03: the shipped default, so the judge's fail-closed branch is only ever
  // reached by an operator who emptied this list themselves.
  hostAllowlist: [...DEFAULT_HOST_ALLOWLIST],
  autoMode: true,
  defaultCommand: 'claude',
  godProvider: 'claude',
  godModel: 'claude-opus-4-8',
  // Global default model for every agent that hasn't picked one explicitly — wins
  // over the role-based tiers (modelForRole) in the spawn handler, so all agents
  // (incl. god) default to Fable 5. A per-agent model choice still overrides it.
  defaultModel: 'claude-fable-5',
  // Seeded from the MCP catalog so the consent defaults never drift from it
  // (safe-readonly ON, write/secret OFF).
  mcpDefaults: defaultMcpDefaults(),
  mcpAgentGrants: {},
  mcpConsentMigratedV1: false,
  maxConcurrentWorkers: 4,
  workerIdleTimeoutMinutes: 20,
  integrations: [],
  defaultWorkerTokenCap: 0, // 0 = unlimited (human directive: NO per-worker cap)
  semanticMemory: true,
  embeddingModel: 'minilm',
  missions: [OPS_STANDUP_MISSION],
  notifications: false,
  strongKeepalive: false,
  autoUpdate: true,
  telemetryEnabled: true,
  multiWindow: true,
  tvShowOffices: false,
  officeTheme: 'office',
  slackEnabled: false,
  tunnelEnabled: false,
  slackSigningSecret: undefined,
  slackBotToken: undefined,
  slackChannelId: undefined,
  slackPort: undefined,
  slackProactivePosting: false,
  freeflowEnabled: true,
  groqApiKey: undefined,
  freeflowModel: 'whisper-large-v3-turbo',
  realtimeVoiceEnabled: false,
  realtimeIdleDisconnectMs: 180_000,
  webhookEnabled: false,
  webhookSecret: undefined,
  webhookPort: undefined,
  // Triggers. These three are the ONLY object/array defaults that get handed
  // straight back out of `readConfig` for a config that never persisted them, so
  // `withTriggerDefaults` re-copies them on every read — see the note there.
  contextTrigger: DEFAULT_CONTEXT_TRIGGER,
  webhookTriggers: [],
  orgTrigger: DEFAULT_ORG_TRIGGER,
  triggersMigratedV1: false,
  // Memory reflection — preventive; nobody is over threshold today, so it sits
  // dark until an agent's memory crosses one of these (the verify gate is the
  // safety for the LLM step). Thresholds DECIDED by god 2026-06-06.
  reflectEnabled: true,
  reflectIntervalMs: 1_800_000,
  reflectByteTriggerPct: 50,
  reflectSectionTrigger: 50,
  reflectRecentKeep: 12,
  reflectMinBytes: 16_384,
  // Document keyword store — opt-in; dark until the user enables it.
  // v0.3.4 fix: default OFF, matching the field's own documentation ("Default
  // OFF / dark until enabled") — the true default contradicted it. Existing
  // installs keep their persisted value.
  knowledgeGraph: { enabled: false }
};

function configPath(): string {
  return join(app.getPath('userData'), 'config.json');
}

// ─── Secrets live in the encrypted store, not in config.json (#10) ────
/**
 * config.json used to hold the Slack signing secret, the Slack bot token, the
 * webhook secrets and the Groq key as plaintext with no file mode — and
 * `config:get` handed every one of them to the renderer. They now live in the
 * SAME encrypted store the integrations broker already uses (Electron
 * `safeStorage` + a 0o600 file, src/main/integrations.ts). One store, not two.
 *
 * The move is INVISIBLE to every consumer: `readConfig` decrypts them back onto
 * the object it returns, so `cfg.slackSigningSecret` reads exactly as it always
 * did in main, and `persistConfig` strips them out again on the way to disk.
 * That strip is also the migration — the first read of a config that still
 * carries plaintext writes it back through `persistConfig` once, and the
 * plaintext is gone.
 *
 * The renderer is the one consumer that must NOT see them: it gets
 * `redactedConfig()` (below), which is why REDACTED round-trips as "unchanged".
 */
const SECRET_FIELDS = {
  slackSigningSecret: 'cfg:slackSigningSecret',
  slackBotToken: 'cfg:slackBotToken',
  webhookSecret: 'cfg:webhookSecret',
  groqApiKey: 'cfg:groqApiKey'
} as const;
type SecretField = keyof typeof SECRET_FIELDS;
const SECRET_FIELD_NAMES = Object.keys(SECRET_FIELDS) as SecretField[];
/** The prefix every ref this module owns shares, so a reset drops them together. */
const SECRET_PREFIX = 'cfg:';
/** Per-endpoint webhook secrets: one ref per trigger id, so revoking one caller
 *  never disturbs the others (the same promise WebhookTrigger.secret makes). */
function triggerSecretRef(id: string): string { return `${SECRET_PREFIX}webhookTrigger:${id}`; }

/** What the renderer is shown in place of a secret. Fixed-width on purpose: a
 *  placeholder that echoed the real length would leak it. It is also exactly what
 *  the Settings form hands back on save when the user did not retype the field,
 *  which is why `writeConfig` reads it as "leave the stored secret alone". */
export const REDACTED = '***';

/** Decrypted secrets, cached for the process. `readConfig` runs on hot paths
 *  (every spawn, every mission beat, most IPC), and a miss is an OS keychain
 *  round-trip. Dropped on every write — the only way a value changes. */
let secretCache: Record<string, string | undefined> | null = null;
/** Warn once, not on every write, when the OS has no encryption to offer. */
let warnedNoEncryption = false;

function cachedSecret(ref: string): string | undefined {
  if (!secretCache) secretCache = {};
  if (!(ref in secretCache)) secretCache[ref] = getSecret(ref);
  return secretCache[ref];
}

/** Put the stored secrets back onto the object every main-process consumer
 *  already reads. A value still sitting in config.json (pre-migration, or an
 *  install with no OS encryption) is used only when the store has nothing. */
function withSecrets(cfg: HarnessConfig): HarnessConfig {
  const out: HarnessConfig = { ...cfg };
  for (const f of SECRET_FIELD_NAMES) {
    const stored = cachedSecret(SECRET_FIELDS[f]);
    if (stored) out[f] = stored;
  }
  if (Array.isArray(out.webhookTriggers)) {
    out.webhookTriggers = out.webhookTriggers.map((t) => {
      const stored = cachedSecret(triggerSecretRef(t.id));
      return stored ? { ...t, secret: stored } : t;
    });
  }
  return out;
}

/**
 * Persist one secret and return whatever still has to go into config.json
 * (`undefined` once the store has it — which is the point).
 *
 * `setSecret` fails CLOSED when the OS offers no encryption. Losing the user's
 * Slack setup on such a machine would be a worse bug than the one this fixes, so
 * the plaintext stays exactly where it was and we say so once.
 */
function storeSecret(ref: string, value: string | undefined): string | undefined {
  const v = typeof value === 'string' ? value.trim() : '';
  // Belt to `writeConfig`'s braces: never store the placeholder, and never let it
  // erase what is already stored.
  if (v === REDACTED) return undefined;
  if (!v) { deleteSecret(ref); return undefined; }
  const r = setSecret(ref, v);
  if (r.ok) return undefined;
  if (!warnedNoEncryption) {
    warnedNoEncryption = true;
    console.warn(`[config] ${r.error ?? 'secret store unavailable'} — secrets stay in config.json on this machine`);
  }
  return v;
}

/** Move every secret out of the object we are about to write. */
function stripSecrets(cfg: HarnessConfig): HarnessConfig {
  const out: HarnessConfig = { ...cfg };
  for (const f of SECRET_FIELD_NAMES) out[f] = storeSecret(SECRET_FIELDS[f], cfg[f]);
  if (Array.isArray(cfg.webhookTriggers)) {
    // `secret` is required on WebhookTrigger, so it is emptied rather than
    // deleted — the shape on disk stays valid and `withSecrets` refills it.
    out.webhookTriggers = cfg.webhookTriggers.map((t) => ({
      ...t,
      secret: storeSecret(triggerSecretRef(t.id), t.secret) ?? ''
    }));
  }
  secretCache = null;
  return out;
}

/**
 * A renderer-safe copy of the config: every secret replaced by a fixed
 * placeholder, never the real value and never its length (#10).
 *
 * KEEP THIS EXPORTED — `ipcMain.handle('config:get')` in src/main/index.ts is its
 * caller, and without it the renderer receives the Slack signing secret, the bot
 * token, every webhook secret and the Groq key in the clear on every boot.
 * Presence is preserved (a set secret redacts to a truthy placeholder) because
 * the renderer legitimately shows "a key is configured".
 */
export function redactedConfig(cfg: HarnessConfig): HarnessConfig {
  const out: HarnessConfig = { ...cfg };
  for (const f of SECRET_FIELD_NAMES) if (out[f]) out[f] = REDACTED;
  if (Array.isArray(cfg.webhookTriggers)) {
    out.webhookTriggers = cfg.webhookTriggers.map((t) => ({ ...t, secret: t.secret ? REDACTED : '' }));
  }
  return out;
}

// ─── Mission fire stamps live in the kv store, not in config.json (#3) ───
/**
 * `lastFiredAt` is the only field the scheduler ever writes, and it writes it on
 * every mission tick and every heartbeat beat — which rewrote the whole
 * config.json on a timer, each rewrite a window in which a crash truncates the
 * file and the app reboots into onboarding.
 *
 * The stamps go into the existing SQLite kv (PersistStore) instead. `readConfig`
 * overlays them back onto the missions, so `m.lastFiredAt` reads the same
 * everywhere, and `persistConfig` diverts them there rather than into the file —
 * after which the scheduler's write is byte-identical to what is already on disk
 * and is skipped outright.
 */
const MISSION_FIRED_KEY = 'missionLastFiredAt';
/** undefined = not opened yet; null = unavailable, so stamps stay in config.json. */
let firedDb: PersistStore | null | undefined;

/**
 * `harnessHome` straight off the file, with NONE of `readConfig`'s pipeline.
 *
 * This is the getter `firedStore()` below injects, and it must NOT be
 * `() => readConfig().harnessHome` however much shorter that reads.
 * `firedStore()` is itself called from inside `readConfig` (via
 * `withMissionStamps`/`stripMissionStamps`), so a getter that calls `readConfig`
 * re-enters it — and `migrateMcpConsentV1` and `migrateTriggersV1` are ONE-SHOT
 * migrations latched by a process-global boolean. The inner read burns the latch,
 * the outer read then early-returns, and the migration silently never applies:
 * measured as `test/mcp-per-agent.test.cjs` going red with floor-wide write/secret
 * MCP consent left armed. A path lookup has no business running two schema
 * migrations, a secret overlay and a config write.
 *
 * Un-cached on purpose: it is read once per `open()`, and `writeConfig` has
 * already normalized whatever is in the file.
 */
function harnessHomeOnDisk(): string | null {
  try {
    const p = configPath();
    if (!existsSync(p)) return null;
    const raw = JSON.parse(readFileSync(p, 'utf8')) as Partial<HarnessConfig>;
    return typeof raw.harnessHome === 'string' && raw.harnessHome ? raw.harnessHome : null;
  } catch {
    // Unreadable/corrupt config: fall back to the userData path rather than
    // failing the open. `readConfig` owns quarantining that file, not this.
    return null;
  }
}

function firedStore(): PersistStore | null {
  if (firedDb !== undefined) return firedDb;
  firedDb = null;
  try {
    // A second connection to the same harness.db index.ts already opens. SQLite in
    // WAL mode is fine with that, and it keeps config.ts free of an import from
    // index.ts — which imports config.
    //
    // SCALE-01: harnessHome-aware, like boot.ts's handle — but through the
    // file-level reader above, never readConfig(). See its comment.
    const s = new PersistStore(undefined, harnessHomeOnDisk);
    s.open();
    firedDb = s;
  } catch (e) {
    console.warn('[config] mission stamps stay in config.json:', e instanceof Error ? e.message : String(e));
  }
  return firedDb;
}

/**
 * Drop the memoized mission-stamps handle so the NEXT `firedStore()` reopens at
 * the freshly-resolved default path — this file's own equivalent of
 * `PersistStore.repoint()`, one memoization layer up.
 *
 * Called only from `config:update`'s `harnessHome: null -> set` transition, the
 * one path that changes the home WITHOUT relaunching. Everywhere else
 * (`changeHome`, `resetAll`) the process restarts and rebuilds this for free.
 */
export function repointFiredStore(): void {
  firedDb?.close();
  firedDb = undefined;
}

function withMissionStamps(cfg: HarnessConfig): HarnessConfig {
  if (!Array.isArray(cfg.missions) || cfg.missions.length === 0) return cfg;
  const fired = firedStore()?.getKv<Record<string, number>>(MISSION_FIRED_KEY);
  if (!fired || typeof fired !== 'object') return cfg;
  return {
    ...cfg,
    missions: cfg.missions.map((m) => {
      // Keep the newer of the two: an install upgrading from the config-file era
      // carries its stamps in the file until the first write moves them.
      const ts = Math.max(m.lastFiredAt ?? 0, fired[m.id] ?? 0);
      return ts ? { ...m, lastFiredAt: ts } : m;
    })
  };
}

function stripMissionStamps(cfg: HarnessConfig): HarnessConfig {
  const store = firedStore();
  if (!store || !Array.isArray(cfg.missions)) return cfg;
  const fired: Record<string, number> = {};
  const missions: ScheduledMission[] = cfg.missions.map((m) => {
    if (!(typeof m.lastFiredAt === 'number' && m.lastFiredAt > 0)) return m;
    fired[m.id] = m.lastFiredAt;
    const { lastFiredAt: _moved, ...rest } = m;
    return rest;
  });
  store.setKv(MISSION_FIRED_KEY, fired);
  return { ...cfg, missions };
}

/**
 * Deep-fill the trigger sub-objects, and hand back copies of them.
 *
 * TWO problems, one fix. First, the merge in `readConfig` is one level deep, so a
 * `contextTrigger` persisted by an older build (or by a `writeConfig` that
 * patched only `compact`) arrives missing sub-keys that DEFAULTS would have
 * supplied — the consumer then reads `undefined` where it expects a number and
 * the rule never fires. Second, that same shallow merge hands the literal
 * DEFAULT_CONTEXT_TRIGGER / DEFAULT_ORG_TRIGGER instances to every config that
 * didn't persist them, so one caller mutating what it read would rewrite the
 * defaults for the whole process — and for every config read afterwards.
 *
 * Every branch below therefore constructs a fresh object, including the
 * "nothing persisted" branch.
 */
function withTriggerDefaults(cfg: HarnessConfig): HarnessConfig {
  return {
    ...cfg,
    contextTrigger: {
      compact: { ...DEFAULT_CONTEXT_TRIGGER.compact, ...cfg.contextTrigger?.compact },
      clear: { ...DEFAULT_CONTEXT_TRIGGER.clear, ...cfg.contextTrigger?.clear }
    },
    orgTrigger: { ...DEFAULT_ORG_TRIGGER, ...cfg.orgTrigger },
    webhookTriggers: Array.isArray(cfg.webhookTriggers)
      ? cfg.webhookTriggers.map((t) => ({ ...t }))
      : []
  };
}

/** Set once `migrateTriggersV1` has run in THIS process. `writeConfig` reads
 *  before it writes, so without an in-memory latch the migration's own persist
 *  would re-enter `readConfig` and run the migration a second time before
 *  `triggersMigratedV1: true` ever reached disk. */
let triggersMigrationRan = false;

/**
 * Fold the pre-Triggers config shape forward, exactly once per install.
 *
 * Runs from `readConfig`, so it is complete before any consumer can observe the
 * config — there is no boot ordering to get wrong and no window in which half
 * the app sees the old shape. Two things move:
 *
 *   1. The single legacy webhook (`webhookEnabled`/`webhookSecret`) becomes one
 *      `WebhookTrigger` with the stable id `legacy`, so the caller that already
 *      holds that secret keeps working across the upgrade. Skipped when
 *      `webhookTriggers` is already populated — the user has moved on, and
 *      re-adding a synthesised entry would resurrect a revoked endpoint.
 *   2. The seeded `compact-maintenance` mission moves from the old 1h cadence to
 *      2h, but ONLY if it still reads exactly 1h. A user-chosen interval is a
 *      decision, not a stale default, and is left alone.
 *
 * Wrapped end-to-end in a try/catch: a config that is corrupt in some unrelated
 * way must still boot the app, and a migration is never worth a failed launch.
 */
function migrateTriggersV1(cfg: HarnessConfig): HarnessConfig {
  if (cfg.triggersMigratedV1 || triggersMigrationRan) return cfg;
  triggersMigrationRan = true;
  try {
    const next: HarnessConfig = { ...cfg, triggersMigratedV1: true };

    const legacySecret = typeof cfg.webhookSecret === 'string' ? cfg.webhookSecret.trim() : '';
    if (legacySecret && (cfg.webhookTriggers?.length ?? 0) === 0) {
      next.webhookTriggers = [
        {
          id: 'legacy',
          name: 'Default webhook',
          secret: legacySecret,
          enabled: cfg.webhookEnabled ?? false,
          mode: DEFAULT_TRIGGER_MODE,
          schema: DEFAULT_WEBHOOK_SCHEMA,
          createdAt: Date.now()
        }
      ];
    }

    const missions = Array.isArray(cfg.missions) ? cfg.missions : [];
    const stale = (m: ScheduledMission): boolean =>
      m?.id === COMPACT_MAINTENANCE_MISSION.id
      && m.intervalMs === LEGACY_COMPACT_MAINTENANCE_INTERVAL_MS;
    if (missions.some(stale)) {
      next.missions = missions.map((m) =>
        stale(m) ? { ...m, intervalMs: COMPACT_MAINTENANCE_MISSION.intervalMs } : m
      );
    }

    persistConfig(next);
    return next;
  } catch {
    // Leave the config exactly as read. The latch above stays set, so a failing
    // migration retries on the next launch rather than on every single read.
    return cfg;
  }
}

/** Set once `migrateMcpConsentV1` has run in THIS process — mirrors
 *  `triggersMigrationRan` exactly, same reason: `persistConfig` below
 *  re-enters `readConfig`, and without an in-memory latch the migration's own
 *  write would re-run itself before `mcpConsentMigratedV1: true` reaches disk. */
let mcpConsentMigrationRan = false;

/**
 * D-27: `write`/`secret` MCP consent moves from floor-wide (`mcpDefaults`) to
 * per-agent (`mcpAgentGrants`). Fold that forward exactly once per install —
 * the line-for-line shape of `migrateTriggersV1` above (one-shot, latched,
 * try/catch-wrapped, never fatal).
 *
 * Every `mcpDefaults[id]` whose catalog tier is NOT `safe-readonly` and whose
 * `enabled` is `true` is set to `false`. `safe-readonly` entries are left
 * alone (that tier stays floor-wide — nothing to migrate). Ids absent from
 * the catalog are left alone too (they can never be armed — `buildDefault
 * McpServers` only ever iterates the catalog, so a stale id is inert either
 * way). This does NOT create a per-agent grant from what it drops: an
 * agent-scoped capability grant has to be made TO an agent, and inferring the
 * grantee is how one floor-wide default becomes eleven silent grants. The
 * operator re-grants explicitly, per agent — a real, operator-visible cost,
 * recorded in the SUMMARY, not engineered around.
 */
function migrateMcpConsentV1(cfg: HarnessConfig): HarnessConfig {
  if (cfg.mcpConsentMigratedV1 || mcpConsentMigrationRan) return cfg;
  mcpConsentMigrationRan = true;
  try {
    const next: HarnessConfig = { ...cfg, mcpConsentMigratedV1: true };
    const floor = cfg.mcpDefaults;
    if (floor) {
      let changed = false;
      const droppedFloor: { [id: string]: { enabled: boolean } } = { ...floor };
      for (const e of MCP_CATALOG) {
        if (e.tier === 'safe-readonly') continue;
        if (droppedFloor[e.id]?.enabled === true) {
          droppedFloor[e.id] = { ...droppedFloor[e.id], enabled: false };
          changed = true;
        }
      }
      if (changed) next.mcpDefaults = droppedFloor;
    }
    persistConfig(next);
    return next;
  } catch {
    // Leave the config exactly as read. The latch above stays set, so a
    // failing migration retries on the next launch rather than every read.
    return cfg;
  }
}

/**
 * One-shot per damaged file: move an unreadable config aside instead of letting
 * the defaults we are about to return quietly overwrite it (#3).
 *
 * Returning bare defaults for a config we could not parse is what makes a
 * truncated write look like a fresh install — harnessHome null, no missions, no
 * god — and the very next `writeConfig` would then commit that fiction over the
 * only copy of the floor. The rename keeps the bytes (recoverable by hand) AND
 * means the next read takes the honest "no file yet" path instead of quarantining
 * the same file again on every read.
 */
function quarantineConfig(p: string, err: unknown): void {
  try {
    const kept = `${p}.corrupt-${Date.now()}`;
    renameSync(p, kept);
    console.error(
      `[config] ${p} is unreadable (${err instanceof Error ? err.message : String(err)}) — `
      + `kept it at ${kept} and booting on defaults; the previous floor is recoverable from that file`
    );
  } catch { /* best-effort: never block a boot on the rescue */ }
}

export function readConfig(): HarnessConfig {
  const p = configPath();
  // No file yet = a first run with nothing to migrate; the defaults ARE the
  // post-migration shape. Deliberately does not persist — a bare read must not
  // conjure a config.json before onboarding has written one.
  if (!existsSync(p)) return withTriggerDefaults({ ...DEFAULTS });
  let parsed: Partial<HarnessConfig>;
  try {
    parsed = JSON.parse(readFileSync(p, 'utf8')) as Partial<HarnessConfig>;
  } catch (e) {
    quarantineConfig(p, e);
    return withTriggerDefaults({ ...DEFAULTS });
  }
  const merged = withMissionStamps(withSecrets(withTriggerDefaults({ ...DEFAULTS, ...parsed })));
  return migrateMcpConsentV1(migrateTriggersV1(migrateSecrets(merged, parsed)));
}

/** Fold a plaintext-era config forward: `persistConfig` does the actual moving
 *  (and the strip), so this only has to notice that there is something to move.
 *  Idempotent and un-latched — one write later there is no plaintext to find, so
 *  a config that is never written again still gets cleaned on its first read. */
function migrateSecrets(cfg: HarnessConfig, raw: Partial<HarnessConfig>): HarnessConfig {
  const plaintext =
    SECRET_FIELD_NAMES.some((f) => typeof raw[f] === 'string' && (raw[f] as string).length > 0)
    || (Array.isArray(raw.webhookTriggers) && raw.webhookTriggers.some((t) => !!t?.secret));
  if (!plaintext) return cfg;
  try { return persistConfig(cfg); } catch { return cfg; }
}

/** `<path>\n<body>` of the last successful write. The scheduler now hands us
 *  configs that differ in nothing at all, and rewriting the file for one of those
 *  is a crash window bought for no gain. Keyed by path so two different userData
 *  dirs can never alias each other. */
let lastPersisted: string | null = null;

function persistConfig(next: HarnessConfig): HarnessConfig {
  const p = configPath();
  // Secrets and mission stamps go to their own stores first; what survives that
  // is everything config.json is still allowed to hold.
  const body = JSON.stringify(stripSecrets(stripMissionStamps(next)), null, 2);
  const stamp = `${p}\n${body}`;
  if (stamp === lastPersisted) return next;
  mkdirSync(dirname(p), { recursive: true });
  // Temp + rename: `rename` is atomic within a filesystem, so a crash mid-write
  // leaves either the old config or the new one, never the truncated file that
  // `readConfig` would have to fall back to defaults for — losing harnessHome,
  // the god id, every agent's cwd and the whole mission list (#3). Same shape as
  // roster.ts, which has always done it right.
  const tmp = `${p}.tmp`;
  try {
    writeFileSync(tmp, body, 'utf8');
    renameSync(tmp, p);
  } catch (e) {
    try { rmSync(tmp, { force: true }); } catch { /* noop */ }
    throw e;
  }
  lastPersisted = stamp;
  return next;
}

export function writeConfig(patch: Partial<HarnessConfig>): HarnessConfig {
  const current = readConfig();
  const next: HarnessConfig = { ...current, ...patch };
  // The renderer is shown REDACTED instead of a secret (#10), and the Settings
  // form hands that placeholder straight back whenever the user saves without
  // retyping the field. Read it as "unchanged" HERE, where the real value is
  // still in `current` — a save must never be able to erase a secret.
  for (const f of SECRET_FIELD_NAMES) if (next[f] === REDACTED) next[f] = current[f];
  if (Array.isArray(patch.webhookTriggers)) {
    const prior = new Map((current.webhookTriggers ?? []).map((t) => [t.id, t.secret]));
    next.webhookTriggers = patch.webhookTriggers.map((t) =>
      t.secret === REDACTED ? { ...t, secret: prior.get(t.id) ?? '' } : t
    );
  }
  // Project INGESTION — a registered repo is typed by hand ("~/dev/foo") as often
  // as it is picked from the folder dialog. Expand `~` here so the persisted list
  // (and therefore every agent's default cwd) is ABSOLUTE; Node's fs/spawn treat
  // `~` as a literal directory name and the spawn dies with `cwd does not exist`.
  if (Array.isArray(patch.registeredRepos)) {
    const seen = new Set<string>();
    next.registeredRepos = patch.registeredRepos
      .map((r) => expandTilde(r))
      .filter((r) => r && !seen.has(r) && (seen.add(r), true));
  }
  // The HIVE HOME needs the exact same treatment as registeredRepos above, and for
  // years it did not get it (#140). Onboarding SUGGESTS `~/HarnessAgents` and the
  // field is free text, so the common path — accept the default, press Finish —
  // persisted a literal `~`. The first thing the finish step does is create the
  // directory, and Node's mkdir has no idea what `~` means: it tried to make a
  // folder actually named "~", which fails as
  //   ENOENT: no such file or directory, mkdir '~/HarnessAgents'
  // and left the wizard wedged on its last step with no way forward. Expand BEFORE
  // the value is persisted or copied into recentHives, so every downstream reader
  // (mkdir, the hive root, the launch picker) sees one absolute path.
  if (typeof patch.harnessHome === 'string' && patch.harnessHome) {
    const { home, recentHives } = normalizeHiveHome(patch.harnessHome, current.recentHives ?? []);
    next.harnessHome = home;
    next.recentHives = recentHives;
  }
  return persistConfig(next);
}

/** Wipe the persisted config back to first-run defaults so the app boots into
 *  onboarding again. Used by the "reset & start over" flow. */
export function resetConfig(): HarnessConfig {
  // Drop every secret this module owns BEFORE the write. A reset used to erase
  // them simply by overwriting the whole file; now that they live in the
  // encrypted store, the per-endpoint webhook secrets would otherwise survive a
  // "reset & start over" as orphans nothing references (#10). The MCP grant
  // family is #10 again with a different prefix: an id is `int:mcp:<agentId>:
  // <mcpId>` (secretRefFor(mcpGrantKey(...))), which the `cfg:` sweep above
  // never reaches — a reset would otherwise leave live encrypted MCP
  // credentials behind with no config entry pointing at them.
  deleteSecretsWithPrefix(SECRET_PREFIX);
  deleteSecretsWithPrefix(secretRefFor(MCP_GRANT_PREFIX));
  secretCache = null;
  // Straight through persistConfig, which is atomic and also clears the mission
  // fire stamps (DEFAULTS carry none), so reset has one write path like the rest.
  persistConfig({ ...DEFAULTS });
  // Drop the migration latches too: the file on disk is back to
  // `triggersMigratedV1: false` / `mcpConsentMigratedV1: false`, and a latch
  // left set would keep the flag from ever being written again in this
  // process. Both migrations are no-ops on defaults either way.
  triggersMigrationRan = false;
  mcpConsentMigrationRan = false;
  return withTriggerDefaults({ ...DEFAULTS });
}

/** Model ids by tier (Lane A #6.4). Kept in sync with AGENT_MODELS in
 *  src/renderer/src/store/config.ts. */
const MODEL_GOD = 'claude-opus-4-8';                  // orchestration — highest capability
const MODEL_WORKER = 'claude-sonnet-4-6';             // general execution
const MODEL_HELPER = 'claude-haiku-4-5-20251001';     // narrow, cheap helpers

/** Minimal structural shape for tiering — a subset of AgentMeta so config.ts
 *  stays free of a hive.ts import. */
export interface RoleHint {
  isGod?: boolean;
  role?: string;
  capabilities?: string[];
}

/** Default model for an agent given its role (Lane A #6.4): Opus for the god,
 *  Haiku for narrow helpers (triage / routing / verification / formatting),
 *  Sonnet for general workers. Returns a model id (matching AGENT_MODELS) or
 *  undefined to fall back to the CLI default. This is only a DEFAULT — an
 *  explicit per-agent model selection always wins. */
export function modelForRole(
  meta: RoleHint,
  config?: Pick<HarnessConfig, 'godProvider' | 'godModel'>
): string | undefined {
  if (meta.isGod) {
    // GOD engine is selectable: an explicit godModel wins, else the chosen
    // provider's recommended orchestrator model, else the legacy Opus default.
    const preset = providerPreset(config?.godProvider ?? 'claude');
    return config?.godModel ?? preset.recommendedOrchestratorModel ?? MODEL_GOD;
  }
  const hay = `${meta.role ?? ''} ${(meta.capabilities ?? []).join(' ')}`.toLowerCase();
  if (/\b(triage|rout|verif|lint|format|summar|classif|label)/.test(hay)) return MODEL_HELPER;
  return MODEL_WORKER;
}

/** Auto-suggested command string given current autoMode preference.
 *
 *  This is the ONE place the permission bypass is appended, so it is also the one
 *  place worth reading to know what `autoMode: true` actually buys: every engine's
 *  flag here removes the interactive tool-approval prompt entirely (#4). Nothing
 *  in this function can put a human back in the loop — the enforcement that
 *  survives a bypass is the `permissions.deny` list in the per-agent settings the
 *  hive writes, plus `control.toolDecision` at PreToolUse.
 *
 *  …UNLESS the operator turned this engine's sandbox opt-in on (GATE-04/D-14), in
 *  which case the bypass is REPLACED by `-s workspace-write --add-dir <agentDir>`:
 *  the sandbox stays up and the agent's own folder is added as a writable root, so
 *  hive housekeeping still works. Default is off and is byte-identical to what
 *  shipped (D-15's verified fallback).
 *
 *  L-08 — THIS IS ONE OF TWO INDEPENDENT ASSEMBLERS. `buildSpawnCommand`
 *  (src/renderer/src/store/config.ts) does the same job for the renderer, and the two
 *  live in DIFFERENT tsconfig projects, so `npm run typecheck` cannot see a drift
 *  between them. Any edit here must be mirrored there in the same commit;
 *  test/spawn-command-parity.test.cjs calls BOTH and asserts they agree, and it is
 *  the only thing that will catch you. */
export function commandForAutoMode(
  config: HarnessConfig,
  provider?: AgentProvider,
  agentDir?: string
): string {
  const p = provider ?? inferAgentProvider(config.defaultCommand);
  const base = p === 'claude' || p === 'custom'
    ? config.defaultCommand
    : defaultCommandForProvider(p, config.defaultCommand);
  if (!config.autoMode) return base;
  // Absent === off, so no existing config on disk changes behaviour and no migration
  // is needed. `sandboxFlagsForProvider` is '' for every engine with no sandbox the
  // floor can turn on, so an opt-in set for such an engine falls through to the flag.
  const sandbox = config.providerSandbox?.[p] ? sandboxFlagsForProvider(p, agentDir) : '';
  const flag = sandbox || autoModeFlagForProvider(p);
  return flag ? `${base} ${flag}` : base;
}

/** Ensure harnessHome exists on disk. */
export function ensureHarnessHome(path: string): { ok: boolean; error?: string } {
  try {
    // Expand HERE too, not only at the config write (#140). This runs FIRST —
    // onboarding calls it before updateConfig — so normalizing only at the write
    // boundary left the actual mkdir still receiving a literal `~`. Depending on
    // the process cwd that either fails outright or, worse, quietly succeeds by
    // creating a directory genuinely named "~" somewhere nobody will look, and
    // the hive then lives at a path the user cannot find. This is the
    // "defense-in-depth at the consumers" the expandTilde doc calls for: the
    // ingestion point normalizes, and the consumer refuses to trust that it did.
    mkdirSync(expandTilde(path), { recursive: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Idempotently pre-accept Claude Code's first-run prompts so agents spawned with
 *  `--permission-mode bypassPermissions` start cleanly. Without this, a fresh
 *  install shows an interactive "WARNING: Bypass Permissions mode … 1. No, exit /
 *  2. Yes, I accept" prompt that the PTY can't answer in time, so the agent exits
 *  code 1 on its own (reported by multiple users).
 *
 *  Two separate gates, written only when they aren't already satisfied (so we
 *  rarely touch files a running `claude` also writes):
 *   1. `~/.claude/settings.json` → `skipDangerousModePermissionPrompt` +
 *      `skipAutoPermissionPrompt` — these gate the bypass-mode warning (global).
 *   2. `~/.claude.json` → `projects[cwd].hasTrustDialogAccepted` — the per-folder
 *      "do you trust the files in this folder?" dialog. */
export function ensureClaudePermissionsAccepted(cwd?: string): void {
  const home = homedir();
  if (!home) return;
  // 1) Global bypass-mode warning gate.
  try {
    const dir = join(home, '.claude');
    const p = join(dir, 'settings.json');
    let s: Record<string, unknown> = {};
    if (existsSync(p)) {
      try { s = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>; } catch { s = {}; }
    }
    if (s.skipDangerousModePermissionPrompt !== true || s.skipAutoPermissionPrompt !== true) {
      s.skipDangerousModePermissionPrompt = true;
      s.skipAutoPermissionPrompt = true;
      mkdirSync(dir, { recursive: true });
      writeFileSync(p, JSON.stringify(s, null, 2), 'utf8');
    }
  } catch { /* best-effort; never block a spawn */ }
  // 2) Per-folder trust dialog gate (only when this cwd isn't already trusted).
  if (cwd) {
    try {
      const p = join(home, '.claude.json');
      let c: { projects?: Record<string, { hasTrustDialogAccepted?: boolean }> } = {};
      if (existsSync(p)) {
        try { c = JSON.parse(readFileSync(p, 'utf8')); } catch { c = {}; }
      }
      if (c.projects?.[cwd]?.hasTrustDialogAccepted !== true) {
        c.projects = c.projects ?? {};
        c.projects[cwd] = { ...(c.projects[cwd] ?? {}), hasTrustDialogAccepted: true };
        writeFileSync(p, JSON.stringify(c, null, 2), 'utf8');
      }
    } catch { /* best-effort */ }
  }
}
