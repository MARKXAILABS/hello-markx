// Mirrors src/main/config.ts. Kept as a renderer-side type-only module
// so we don't have to reach into the preload package to type-check.
import {
  AGENT_PROVIDER_PRESETS,
  providerPreset,
  inferAgentProvider,
  isClaudeProvider,
  sandboxFlagsForProvider,
  type AgentProvider
} from '@shared/agentProvider';
import type {
  ContextTriggerConfig,
  OrgTriggerConfig,
  WebhookTrigger
} from '@shared/triggers';
import {
  LOGIN_ACCOUNT_LABEL,
  AUTO_ACCOUNT_CHOICE,
  AUTO_ACCOUNT_LABEL,
  encodeAccountChoice,
  decodeAccountChoice,
  newAccountLabelError,
  reduceAccountIntegrity,
  LOGIN_ACCOUNT_KEY,
  type ClaudeAccount
} from '@shared/claudeAccounts';
import { fmtCountdown, describeHealth, type PoolSnapshot, type AccountHealth } from '@shared/claudeAccountPool';
import { providerCapabilities, remoteControlAvailability } from '@shared/providerAutomation';
import { MCP_CATALOG, mcpWiredFor, type McpTier } from '@shared/mcpCatalog';

export {
  AGENT_PROVIDER_PRESETS,
  providerPreset,
  inferAgentProvider,
  isClaudeProvider,
  sandboxFlagsForProvider,
  type AgentProvider
};
export {
  LOGIN_ACCOUNT_KEY,
  LOGIN_ACCOUNT_LABEL,
  AUTO_ACCOUNT_CHOICE,
  AUTO_ACCOUNT_LABEL,
  encodeAccountChoice,
  decodeAccountChoice,
  newAccountLabelError,
  reduceAccountIntegrity,
  fmtCountdown,
  describeHealth,
  type ClaudeAccount,
  type PoolSnapshot,
  type AccountHealth
};

/** A recurring auto-dispatched mission (mirrors src/main/config.ts). */
export interface ScheduledMission {
  id: string;
  label: string;
  intervalMs: number;
  to: string;
  body: string;
  enabled: boolean;
  autoCompact?: boolean;
  lastFiredAt?: number;
  kind?: 'dispatch' | 'heartbeat' | 'compact';
  quietThresholdMs?: number;
}

/** Circuit-breaker thresholds (mirrors src/main/config.ts CircuitBreakerConfig). */
export interface CircuitBreakerConfig {
  enabled?: boolean;
  hardStop?: boolean;
  repeatedToolLimit?: number;
  errorStormLimit?: number;
  tokenVelocityPerMin?: number;
}

/** Document keyword store config (mirrors src/main/config.ts KnowledgeGraphConfig).
 *  Keyword scoring over text chunks, not a graph — see src/main/kg-core.cjs. */
export interface KnowledgeGraphConfig {
  enabled?: boolean;
  rootPath?: string;
}

export interface HarnessConfig {
  onboardingComplete: boolean;
  /** Self-identified audience from the first onboarding screen ('technical' vs
   *  'non-technical') — drives the copy register across onboarding. Mirrors
   *  src/main/config.ts. */
  audience?: 'technical' | 'non-technical';
  harnessHome: string | null;
  /** Recently-opened hive home folders (most-recent first) for the launch picker.
   *  Mirrors src/main/config.ts. */
  recentHives?: string[];
  registeredRepos: string[];
  autoMode: boolean;
  defaultCommand: string;
  /** Default model for newly spawned agents (e.g. 'claude-sonnet-4-6[1m]'); unset = CLI default. */
  defaultModel?: string;
  /** Which provider+model powers the GOD orchestrator ("Michael"). Default
   *  'claude' / 'claude-opus-4-8'. Mirrors src/main/config.ts. */
  godProvider?: AgentProvider;
  godModel?: string;
  /** Per-server consent for the default MCP bundle, keyed by catalog id (mirrors
   *  src/main/config.ts; seeded from MCP_CATALOG). */
  mcpDefaults?: { [id: string]: { enabled: boolean } };
  semanticMemory: boolean;
  embeddingModel: 'minilm' | 'embeddinggemma';
  missions?: ScheduledMission[];
  opsStandupSeeded?: boolean;
  heartbeatSeeded?: boolean;
  notifications?: boolean;
  /** Opt-in "strong keep-alive": escalates the in-app power blocker to
   *  prevent-display-sleep so scheduled missions/terminals keep firing on time
   *  while away (battery cost; best on AC). Default off = survive + catch up on
   *  resume. Mirrors the main-process field (src/main/config.ts). */
  strongKeepalive?: boolean;
  /** Auto-update from GitHub releases (default ON; Settings → General). */
  autoUpdate?: boolean;
  /** Anonymous product analytics (default ON, opt-out; see TELEMETRY.md).
   *  Mirrors the main-process field (src/main/config.ts). */
  telemetryEnabled?: boolean;
  slackEnabled?: boolean;
  slackSigningSecret?: string;
  slackBotToken?: string;
  slackChannelId?: string;
  slackPort?: number;
  /** Opt-in app/voice-initiated proactive Slack posting (default OFF). Mirrors
   *  src/main/config.ts; the Slack-origin done-reply round-trip is never gated. */
  slackProactivePosting?: boolean;
  /** Free Flow voice dictation (mirrors src/main/config.ts). */
  freeflowEnabled?: boolean;
  groqApiKey?: string;
  freeflowModel?: string;
  /** Realtime voice idle auto-disconnect (ms); default 180000 (3 min), 0 = never.
   *  Tuned in Settings → Realtime Michael; the cost cap stays the runaway guard. */
  realtimeIdleDisconnectMs?: number;
  costCapUsd?: number;
  /** Hard total-token ceiling across active agents (the user-facing budget). */
  costCapTokens?: number;
  /** Per-agent total-token ceiling, keyed by agent id. Overrides the floor budget
   *  for that agent's meter and trips the breaker for it alone. */
  agentTokenCaps?: Record<string, number>;
  autoDeliveryPausedAgents?: string[];
  maxTurns?: number;
  circuitBreaker?: CircuitBreakerConfig;
  /** Document keyword store (multimodal context for agents). Default OFF. */
  knowledgeGraph?: KnowledgeGraphConfig;
  /** TV-show office themes feature flag (Settings picker + switch flow). Default OFF. */
  tvShowOffices?: boolean;
  /** Active office map/cast theme (honored only when tvShowOffices is on). */
  officeTheme?: 'office' | 'friends' | 'brooklyn99' | 'siliconvalley' | 'got' | 'hogwarts';
  /** Per-CLI-provider local/self-hosted base URL (Ollama/LM Studio/vLLM, …) for the
   *  OpenCode/Crush/pi/qwen engines; applied at spawn. API KEYS are NOT stored here —
   *  they live write-only in the secret broker. */
  providerBaseUrls?: Partial<Record<AgentProvider, string>>;
  /** Per-CLI-provider default model slug, used to pre-fill the model picker. */
  providerDefaultModels?: Partial<Record<AgentProvider, string>>;
  /** GATE-04 / D-15. Per-CLI-provider sandbox opt-in. ABSENT === OFF, which is the
   *  behaviour that shipped and therefore the verified fallback — no migration, no
   *  explicit write. Only engines whose preset declares `sandboxFlags` can act on it
   *  (codex alone today); it is inert for the rest. Mirrors src/main/config.ts. */
  providerSandbox?: Partial<Record<AgentProvider, boolean>>;
  /** Claude account pool — NON-secret metadata only (mirrors src/main/config.ts).
   *  Tokens are write-only in the secret broker via the claudeAccount* bridge. */
  claudeAccounts?: ClaudeAccount[];
  /** Pool account powering the GOD orchestrator; unset = /login account. */
  godAccount?: string;
  /** Michael's assignment policy: 'auto' = least-loaded healthy pool account at
   *  each spawn (godAccount then holds the last resolved one); unset = pinned. */
  godAccountPolicy?: 'auto';
  /** Legacy single-webhook fields (mirrors src/main/config.ts, where they are
   *  deprecated in favour of `webhookTriggers` but still read until the server is
   *  rewired). Declared here so the surfaces that show them can stop widening this
   *  type locally.
   *  @deprecated Use `webhookTriggers`. */
  webhookEnabled?: boolean;
  /** @deprecated Use `webhookTriggers[].secret`. */
  webhookSecret?: string;
  /** @deprecated The port belongs to the shared server, not to any one trigger. */
  webhookPort?: number;
  /** Auto-compaction / auto-clearing of agent terminal context. Main deep-fills
   *  both halves on read, so the renderer can treat the sub-keys as present
   *  (mirrors src/main/config.ts). */
  contextTrigger?: ContextTriggerConfig;
  /** Inbound HTTP endpoints, one per caller — replaces the legacy trio above. */
  webhookTriggers?: WebhookTrigger[];
  /** Peer messaging between teammates' clone nodes (persistence + UI only). */
  orgTrigger?: OrgTriggerConfig;
  /** One-time guard for the main-process triggers migration; read-only here. */
  triggersMigratedV1?: boolean;
}

/** The Sonnet model with the 1M-token context window — used for Michael's prep
 *  assistant (cheap, large-context context gathering). Mirrors ASSISTANT_MODEL
 *  in src/main/assistant.ts; keep the two in sync. */
export const ASSISTANT_MODEL = 'claude-sonnet-4-6[1m]';

export interface ModelOption {
  /** undefined = use the CLI default (no --model flag) */
  id?: string;
  label: string;
}

/** The models offered in the "add agent" picker and the per-agent selector.
 *  `[1m]` selects the 1M-token context window variant. */
// Deliberately has NO "pass no --model flag" entry. Every option here names a
// real model, because the whole reason to open this picker is to know which
// model an agent is on — and a no-flag option resolves to whatever Claude Code
// happens to choose, which the UI cannot show and the user cannot predict. The
// harness default is marked ` · default` instead, and it names a real model.
export const AGENT_MODELS: ModelOption[] = [
  { id: 'claude-fable-5', label: 'Fable 5' },
  { id: 'claude-opus-5', label: 'Opus 5 · 1M' },
  { id: 'claude-opus-4-8', label: 'Opus 4.8' },
  { id: 'claude-opus-4-8[1m]', label: 'Opus 4.8 · 1M' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: ASSISTANT_MODEL, label: 'Sonnet 4.6 · 1M' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' }
];

/** Current OpenAI models offered by Codex for coding agents. The command field
 *  stays editable and `codex --model <id>` is the source of truth. */
export const CODEX_MODELS: ModelOption[] = [
  // No `--model` flag at all — whatever the CLI itself defaults to. NOT the
  // harness's `config.defaultModel`; the pickers mark that one separately, and
  // labelling both "default" is what made the two impossible to tell apart.
  { id: undefined, label: 'CLI default' },
  { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
  { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
  { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' }
];

/** Models offered when an agent runs on the Antigravity CLI (`agy`). agy's
 *  `--model` takes the DISPLAY-NAME LABEL exactly as `agy models` prints it
 *  (verified: agy logs `Propagating selected model override … label="…"`), not a
 *  slug — so these ids ARE the labels (spaces/parens included; buildSpawnCommand
 *  quotes them and the command tokenizer keeps them whole). The command field
 *  stays editable; `agy models` is the source of truth for the live list. */
export const ANTIGRAVITY_MODELS: ModelOption[] = [
  // No `--model` flag at all — whatever the CLI itself defaults to. NOT the
  // harness's `config.defaultModel`; the pickers mark that one separately, and
  // labelling both "default" is what made the two impossible to tell apart.
  { id: undefined, label: 'CLI default' },
  { id: 'Gemini 3.1 Pro (High)', label: 'Gemini 3.1 Pro · High' },
  { id: 'Gemini 3.1 Pro (Low)', label: 'Gemini 3.1 Pro · Low' },
  { id: 'Gemini 3.5 Flash (High)', label: 'Gemini 3.5 Flash · High' },
  { id: 'Gemini 3.5 Flash (Medium)', label: 'Gemini 3.5 Flash · Med' },
  { id: 'Gemini 3.5 Flash (Low)', label: 'Gemini 3.5 Flash · Low' },
  { id: 'Claude Sonnet 4.6 (Thinking)', label: 'Claude Sonnet 4.6' },
  { id: 'Claude Opus 4.6 (Thinking)', label: 'Claude Opus 4.6' },
  { id: 'GPT-OSS 120B (Medium)', label: 'GPT-OSS 120B' }
];

/** Models offered when an agent runs on qwen-code (`qwen`), the proxy-bridge CLI
 *  driving an OpenAI-compatible endpoint. Starting suggestions only (editable
 *  command field). // TODO-verify the live list (`qwen` model ids). */
export const QWEN_MODELS: ModelOption[] = [
  { id: undefined, label: 'default' },
  { id: 'qwen3-coder-plus', label: 'Qwen3 Coder Plus' },
  { id: 'qwen3-coder', label: 'Qwen3 Coder' },
  { id: 'qwen-max', label: 'Qwen Max' }
];

/** Models offered when an agent runs on OpenCode (`opencode`). OpenCode's `--model`
 *  takes a `provider/model` slug; these are curated BYOK suggestions (the command
 *  field stays editable; `opencode models` / models.dev is the source of truth).
 *  // TODO-verify exact live slugs (humanQA — they drift). */
export const OPENCODE_MODELS: ModelOption[] = [
  // "CLI default", not "default" — the distinction ANTIGRAVITY_MODELS already
  // draws: pass NO --model and run whatever OpenCode itself is configured and
  // authenticated for. That is not the harness's own default model, and calling
  // both "default" is what made the two impossible to tell apart. This is now the
  // PRESELECTED entry for OpenCode, because a BYOK slug the user holds no key for
  // fails silently — see the recommendedOrchestratorModel note in agentProvider.ts.
  { id: undefined, label: 'CLI default' },
  { id: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5 (Anthropic)' },
  { id: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku 4.5 (Anthropic)' },
  { id: 'openai/gpt-5', label: 'GPT-5 (OpenAI)' },
  { id: 'openai/gpt-5-mini', label: 'GPT-5 mini (OpenAI)' },
  { id: 'openrouter/anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5 (OpenRouter)' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (Google)' },
  { id: 'local/llama3', label: 'Local · OpenAI-compatible (set base-URL)' }
];

/** Models offered when an agent runs on Crush (`crush`). Crush's `--model` takes a
 *  `provider/model-id` slug; free-text editable (Crush accepts arbitrary slugs).
 *  // TODO-verify exact live ids (humanQA). */
export const CRUSH_MODELS: ModelOption[] = [
  { id: undefined, label: 'Crush default (config)' },
  { id: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5 (Anthropic)' },
  { id: 'anthropic/claude-opus-4-1', label: 'Claude Opus (Anthropic)' },
  { id: 'openai/gpt-4o', label: 'GPT-4o (OpenAI)' },
  { id: 'openai/o3', label: 'o3 (OpenAI)' },
  { id: 'gemini/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { id: 'openrouter/auto', label: 'OpenRouter (auto)' },
  // OpenAI-wire local slug so traffic routes through the proxy (the harness overrides
  // the `openai` provider's base_url → loopback → your configured Crush base-URL).
  // An `ollama/*` slug would bypass the proxy (Dwight verify-crush NIT-2).
  { id: 'openai/local', label: 'Local · OpenAI-compatible (set base-URL)' }
];

/** Models offered when an agent runs on Pi (`pi`). Pi's `--model` takes a
 *  `provider/model` slug (thinking via a `:high` suffix). Curated BYOK suggestions;
 *  free-text editable. // TODO-verify exact live slugs (humanQA). */
export const PI_MODELS: ModelOption[] = [
  { id: undefined, label: 'default' },
  { id: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5 (Anthropic)' },
  { id: 'anthropic/claude-opus-4-1', label: 'Claude Opus (Anthropic)' },
  { id: 'openai/gpt-5', label: 'GPT-5 (OpenAI)' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (Google)' },
  { id: 'groq/llama-3.3-70b', label: 'Llama 3.3 70B (Groq)' },
  { id: 'local/llama3', label: 'Local · OpenAI-compatible (set base-URL)' }
];

/** Models offered when an agent runs on GitHub Copilot (`copilot`). Copilot's
 *  `--model` takes a plain model id ('auto' lets Copilot pick); these are curated
 *  suggestions and the command field stays editable. // TODO-verify exact live ids
 *  (the /model picker is the source of truth; they drift). */
export const COPILOT_MODELS: ModelOption[] = [
  { id: undefined, label: 'default (Claude Sonnet 4.5)' },
  { id: 'auto', label: 'Auto (Copilot picks)' },
  { id: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
  { id: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
  { id: 'gpt-5.4', label: 'GPT-5.4' },
  { id: 'gpt-5', label: 'GPT-5' }
];

/** Models reported by the installed Grok CLI (`grok models`). */
export const GROK_MODELS: ModelOption[] = [
  // No `--model` flag at all — whatever the CLI itself defaults to. NOT the
  // harness's `config.defaultModel`; the pickers mark that one separately, and
  // labelling both "default" is what made the two impossible to tell apart.
  { id: undefined, label: 'CLI default' },
  { id: 'grok-4.6', label: 'Grok 4.6' },
  { id: 'grok-4.5', label: 'Grok 4.5' }
];

/** Managed Kimi Code aliases accepted by `kimi --model <alias>`. */
export const KIMI_MODELS: ModelOption[] = [
  // No `--model` flag at all — whatever the CLI itself defaults to. NOT the
  // harness's `config.defaultModel`; the pickers mark that one separately, and
  // labelling both "default" is what made the two impossible to tell apart.
  { id: undefined, label: 'CLI default' },
  { id: 'kimi-code/k3', label: 'Kimi K3' },
  { id: 'kimi-code/kimi-for-coding', label: 'Kimi K2.7 Code' },
  { id: 'kimi-code/kimi-for-coding-highspeed', label: 'Kimi K2.7 · HighSpeed' }
];

/** Split a command string into argv, respecting double/single quotes so a model
 *  value with spaces (agy's `--model "Gemini 3.1 Pro (High)"`) stays one token.
 *  Quotes are stripped from the result. */
export function tokenizeCommand(command: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(command)) !== null) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/** The model preset list for a given provider's picker. */
export function modelsForProvider(provider: AgentProvider): ModelOption[] {
  if (provider === 'codex') return CODEX_MODELS;
  if (provider === 'grok') return GROK_MODELS;
  if (provider === 'kimi') return KIMI_MODELS;
  if (provider === 'antigravity') return ANTIGRAVITY_MODELS;
  if (provider === 'qwen') return QWEN_MODELS;
  if (provider === 'opencode') return OPENCODE_MODELS;
  if (provider === 'crush') return CRUSH_MODELS;
  if (provider === 'pi') return PI_MODELS;
  if (provider === 'copilot') return COPILOT_MODELS;
  if (provider === 'custom') return [];
  return AGENT_MODELS;
}

/** Providers shown in the Command Center's cross-provider model picker.
 *  God must remain on a provider with a working inbox drain; otherwise switching
 *  to a terminal-only provider would silently disable orchestration. */
export function modelProvidersForAgent(isGod = false) {
  return AGENT_PROVIDER_PRESETS.filter((preset) =>
    preset.supportsModel && (!isGod || preset.canReceiveInbox)
  );
}

/** Native <select> values must carry both provider and model because each
 *  provider has its own "default" option and model namespace. */
export function encodeProviderModel(provider: AgentProvider, model?: string): string {
  return `${provider}:${encodeURIComponent(model ?? '')}`;
}

export function decodeProviderModel(value: string): {
  provider: AgentProvider;
  model?: string;
} | null {
  const split = value.indexOf(':');
  if (split < 1) return null;
  const provider = value.slice(0, split);
  if (!AGENT_PROVIDER_PRESETS.some((preset) => preset.id === provider)) return null;
  try {
    const model = decodeURIComponent(value.slice(split + 1));
    return { provider: provider as AgentProvider, model: model || undefined };
  } catch {
    return null;
  }
}

/** Build the command line to feed into spawnPty, honoring the provider's flags,
 *  autoMode, and an optional per-agent model override. Claude keeps the user's
 *  configured `defaultCommand`; other providers use their preset binary so the
 *  app works without Claude installed. */
export function buildSpawnCommand(
  config: Pick<HarnessConfig, 'defaultCommand' | 'autoMode' | 'providerSandbox'>,
  model?: string,
  provider: AgentProvider = inferAgentProvider(config.defaultCommand),
  agentDir?: string
): string {
  const preset = providerPreset(provider);
  // Claude keeps the user's configured defaultCommand; custom falls back to it
  // too; every other provider (codex, grok, kimi, agy) uses its preset binary so the app
  // works even without Claude installed.
  const base =
    provider === 'claude'
      ? config.defaultCommand || preset.defaultCommand
      : provider === 'custom'
        ? config.defaultCommand || ''
        : preset.defaultCommand;
  let cmd = base;
  if (preset.supportsModel && model && preset.modelFlag) {
    // Quote model values that contain whitespace (agy labels like
    // "Gemini 3.1 Pro (High)") so the command tokenizer keeps them one arg.
    const m = /\s/.test(model) ? `"${model}"` : model;
    cmd = `${cmd} ${preset.modelFlag} ${m}`;
  }
  // Auto (skip-permissions) mode appends each provider's own flag — Claude's
  // bypassPermissions, Codex's dangerous bypass, Grok's always-approve, Kimi's
  // auto, or agy's skip flag.
  //
  // …UNLESS the operator turned this engine's sandbox opt-in on (GATE-04/D-14), in
  // which case the bypass is REPLACED by `-s workspace-write --add-dir <agentDir>`.
  // Absent === off, so no config on disk changes behaviour; `sandboxFlagsForProvider`
  // is '' for every engine with no sandbox the floor can turn on, so an opt-in set
  // for such an engine falls through to that engine's own flag.
  //
  // L-08 — THIS IS ONE OF TWO INDEPENDENT ASSEMBLERS. `commandForAutoMode`
  // (src/main/config.ts) does the same job for main, and the two live in DIFFERENT
  // tsconfig projects, so `npm run typecheck` cannot see a drift between them. Any
  // edit here must be mirrored there in the same commit;
  // test/spawn-command-parity.test.cjs calls BOTH and asserts they agree, and it is
  // the only thing that will catch you.
  if (config.autoMode) {
    const sandbox = config.providerSandbox?.[provider] ? sandboxFlagsForProvider(provider, agentDir) : '';
    const flag = sandbox || preset.autoFlag;
    if (flag) cmd = `${cmd} ${flag}`;
  }
  return cmd;
}

// ── PARITY-01b / DAEMON-04 (plan 02-06) ───────────────────────────────────────
//
// D-30: `capabilityLine()` (providerAutomation.ts) has zero production
// consumers — it is a prompt line written for "a model skimming a roster",
// and rendering its joined string on a 322px card would be five clauses of
// mostly-good-news per agent (UI-SPEC Rule C-1). This section is the ONE
// derivation the three D-31 surfaces (AgentCard, AddAgentModal,
// CommandCenterPanel) all render from — the provider+platform capability
// record `capabilityLine` is itself built from — so the card and the god's
// roster line can never disagree. It does
// NOT give `capabilityLine` a consumer; that string's one intended job stays
// the god's roster injection (hive.ts, plans 02-07/02-08).

export interface CapabilityGap {
  key: 'mail' | 'mcp' | 'spend' | 'compact' | 'remote';
  chip: string;
  sentence: string;
}

/**
 * Every false bit of `provider`'s capability record, ranked
 * `mail > mcp > spend > compact > remote` (UI-SPEC S1a) — the order IS the
 * operational cost: an engine that cannot receive mail cannot be given work
 * at all, one that cannot take MCP cannot be given tools, invisible spend
 * defeats the breaker, remote control is a convenience. `subject` is the
 * agent's display name (or "a {Engine} worker" — AddAgentModal's call site,
 * before any agent exists).
 *
 * `platform` MUST be supplied by the caller as `window.cth.platform`
 * (UI-SPEC Rule C-1a): `providerCapabilities`'s platform parameter defaults
 * through the Node process-globals object when omitted, which is a
 * ReferenceError in the renderer. This function never reads that global
 * itself, and forwards the SAME platform to both `providerCapabilities` and
 * `remoteControlAvailability` — passing it to one and not the other throws on
 * first paint for every non-claude, non-codex engine (D-40, T-P02-06-09).
 */
export function capabilityGaps(
  provider: AgentProvider,
  platform: string,
  subject: string
): CapabilityGap[] {
  const caps = providerCapabilities(provider, platform);
  const engine = providerPreset(provider).label;
  const gaps: CapabilityGap[] = [];
  if (!caps.mail) {
    gaps.push({
      key: 'mail',
      chip: 'NO MAIL',
      sentence: `${engine} cannot receive mail — work routed to ${subject} bounces back to you.`
    });
  }
  if (!caps.mcp) {
    gaps.push({ key: 'mcp', chip: 'NO MCP', sentence: `${engine} cannot take MCP servers.` });
  }
  if (caps.spend === 'none') {
    gaps.push({
      key: 'spend',
      chip: 'NO SPEND',
      sentence: `${engine} reports no cost — ${subject}'s spend is invisible to every budget and to the breaker.`
    });
  }
  if (!caps.compact) {
    gaps.push({
      key: 'compact',
      chip: 'NO COMPACT',
      sentence: `${engine} cannot reclaim context — ${subject} has to be restarted when it fills up.`
    });
  }
  if (!caps.remote) {
    // Phase 1's 01-13 ruling (D-40), kept here verbatim: one shouted string
    // for both branches would have blamed Windows for a gap that exists on
    // every platform, so the chip is shared and only the sentence differs.
    const availability = remoteControlAvailability(provider, platform);
    gaps.push({
      key: 'remote',
      chip: 'NO REMOTE',
      sentence:
        availability === 'windows'
          ? `${engine} has remote control, but not on Windows.`
          : `${engine} has no remote control.`
    });
  }
  return gaps;
}

/** The card's ONE gap chip (S1a): the highest-ranked false bit's chip text,
 *  with a `+N` suffix when more than one bit is false. `null` renders nothing
 *  — "a card with no gap chip means no gap" (Copywriting Contract). */
export function capabilityChipText(gaps: CapabilityGap[]): string | null {
  if (gaps.length === 0) return null;
  const [first, ...rest] = gaps;
  return rest.length > 0 ? `${first.chip} +${rest.length}` : first.chip;
}

/** `⚿` keyed and applied · `⚠` granted, no key stored, not armed · `↻`
 *  granted, agent running, not yet proven applied · `null` no key mark at all
 *  (a consent-tier entry that needs no secret — an extension to UI-SPEC S2's
 *  mark table, arrived at from the catalog: rendering `⚠`/`⚿` for an entry
 *  with no `spec.env` would be misleading/fabricated respectively). */
export type McpMark = '⚿' | '⚠' | '↻' | null;

export interface McpCardMark {
  id: string;
  short: string;
  tier: McpTier;
  mark: McpMark;
  pending: boolean;
}

/** The catalog id up to its first `-`: `github-token` -> `github`,
 *  `search-with-key` -> `search`, `email-calendar` -> `email`, `db` -> `db`. */
function shortMcpId(id: string): string {
  const dash = id.indexOf('-');
  return dash === -1 ? id : id.slice(0, dash);
}

/**
 * The renderer-side cache of per-agent MCP grant state (DAEMON-04). Two
 * halves with two different sources, discovered against the REAL shapes in
 * `src/main/config.ts` and `src/main/index.ts`'s `mcp:agentState` handler
 * this session (D-01: not invented, not assumed) — a mirror that disagrees
 * with main is the three-file-contract failure that shipped Critical #75:
 *
 *  - `mcpDefaults` mirrors the floor-wide safe-readonly consent map on
 *    `HarnessConfig` (`src/main/config.ts:229`-ish / preload's own
 *    `HarnessConfig.mcpDefaults`). Seeded by ONE `window.cth.getConfig()`
 *    call (`ensureMcpGrants`) — config data, available synchronously to
 *    every card on the floor without a per-agent round trip.
 *  - `agents[agentId]` mirrors `mcp:agentState(agentId)`'s live response
 *    (`granted: {id,tier,hasSecret}[]`, `armed: string[]`). `hasSecret` and
 *    `armed` are NOT config fields — `hasSecret` reads the encrypted secret
 *    store and `armed` reads `<agentDir>/mcp.json` off disk
 *    (`hive.mcpArmed`), so `getConfig()` cannot supply either one. This half
 *    is populated when `McpConsentModal` fetches an agent's state (on open,
 *    and again after every successful grant/revoke — the modal calls
 *    `setMcpGrants` to publish it, so the card repaints without its own
 *    refetch). An agent whose modal has never been opened this session reads
 *    as absent here: the card then shows its real floor-wide safe count and
 *    NO granted-server marks for that agent — an under-report, never a
 *    fabricated one. The eager, floor-wide seed belongs in `App.tsx`
 *    alongside `setWebhookTriggers`/`setOrgTrigger` (02-10, wave 8); this
 *    plan does not own that file.
 */
export interface McpGrantsSnapshot {
  mcpDefaults: Record<string, { enabled: boolean }>;
  agents: Record<string, { granted: { id: string; tier: McpTier; hasSecret: boolean }[]; armed: string[] }>;
}

function emptyMcpGrantsSnapshot(): McpGrantsSnapshot {
  return { mcpDefaults: {}, agents: {} };
}

// Module-singleton + subscribe/getSnapshot pair, copying autoMode.ts:83-105's
// shape exactly: plain functions (no hook import, no store import) so this
// module still loads under `node --test`; a cached reference so the React
// sync-external-store hook's snapshot getter stays referentially stable.
let mcpGrantsSnapshot: McpGrantsSnapshot = emptyMcpGrantsSnapshot();
const mcpGrantsListeners = new Set<() => void>();
let mcpGrantsEnsureStarted = false;

/** The last-published grants snapshot — a cached reference, never a fresh
 *  object literal. */
export function getMcpGrantsSnapshot(): McpGrantsSnapshot {
  return mcpGrantsSnapshot;
}

/** Publish a new snapshot. No-ops when the reference is unchanged, so a
 *  redundant publish cannot churn every subscriber. */
export function setMcpGrants(next: McpGrantsSnapshot): void {
  if (next === mcpGrantsSnapshot) return;
  mcpGrantsSnapshot = next;
  for (const l of [...mcpGrantsListeners]) l();
}

export function subscribeMcpGrants(listener: () => void): () => void {
  mcpGrantsListeners.add(listener);
  return () => {
    mcpGrantsListeners.delete(listener);
  };
}

/** Fires ONE `window.cth.getConfig()` to seed the floor-wide `mcpDefaults`
 *  half of the snapshot; a no-op on every call after the first, and a no-op
 *  with no `window.cth` at all (so this module keeps loading under
 *  `node --test`, which is what the guard below is for). */
export function ensureMcpGrants(): void {
  if (mcpGrantsEnsureStarted) return;
  mcpGrantsEnsureStarted = true;
  if (typeof window === 'undefined' || !window.cth?.getConfig) return;
  window.cth
    .getConfig()
    .then((cfg) => {
      setMcpGrants({ ...getMcpGrantsSnapshot(), mcpDefaults: cfg.mcpDefaults ?? {} });
    })
    .catch(() => {
      /* the card falls back to no safe-count data; a retry needs a future load */
    });
}

/**
 * Grant a batch of MCP servers one at a time and report WHICH ids main actually
 * accepted when one of them fails partway through (CR-01).
 *
 * The inline loop this replaced `return`ed on the first failure and threw that
 * list away, so the caller could neither clear the plaintext secrets for the ids
 * already granted nor republish the grants mirror every `AgentCard` reads — the
 * floor kept showing a genuinely-granted server as ungranted for the rest of the
 * session, wrong in the permissive direction. Partial success is reported, never
 * discarded; the caller decides what to do with it.
 *
 * Stops at the first failure (a batch that has already failed is not one whose
 * remaining grants should be attempted) and NEVER throws across this boundary:
 * a rejected call is reported as `error` exactly like an `{ ok: false }`, so an
 * IPC-level throw cannot leave the caller's `busy` flag stuck on.
 */
export async function grantMcpBatch(
  ids: string[],
  grant: (id: string) => Promise<{ ok: boolean; error?: string }>
): Promise<{ granted: string[]; error: string | null }> {
  const granted: string[] = [];
  for (const id of ids) {
    let res: { ok: boolean; error?: string };
    try {
      res = await grant(id);
    } catch (e) {
      return { granted, error: e instanceof Error ? e.message : String(e) };
    }
    if (!res.ok) return { granted, error: res.error ?? `${id}: grant failed` };
    granted.push(id);
  }
  return { granted, error: null };
}

/**
 * The MCP element's data for one agent's card (S2). `null` when the engine
 * cannot take MCP servers at all — the caller renders the `NO MCP` gap chip
 * from `capabilityGaps` and MUST NEVER render an empty `MCP 0 safe`
 * (Copywriting Contract).
 *
 * `pending`/`mark` follow the preload's own documented contract exactly
 * (`src/preload/index.ts`, `mcpAgentState`'s doc comment): *"`pending ·
 * restart` is `granted \ armed`, computed here in the renderer — main never
 * claims a live connection (D-29)."* An agent with no live PTY is never
 * `pending`: nothing is "not yet in effect" for an agent that is not running.
 */
export function mcpCardSummary(
  cfg: McpGrantsSnapshot,
  agentId: string,
  opts: { supportsMcp: boolean; provider?: string; ptyId?: string }
): { safeCount: number; granted: McpCardMark[] } | null {
  if (!opts.supportsMcp) return null;
  // T-P02-11-10. `supportsMcp` answers "can this engine take MCP AT ALL" (the
  // static preset claim, Rule C-1b). `mcpWiredFor` answers "does THIS engine's
  // spawn path actually write a server bundle" — and only `claude` does today
  // (`MCP_WIRED_PROVIDERS`). `hive.ts` gates the real write on the SAME
  // predicate: a non-wired provider gets `{}`, no `mcp.json`, no
  // `--mcp-config`.
  //
  // Gating the card on `supportsMcp` alone is precisely the conflation
  // `mcpCatalog.ts`'s own header warns about — "how a capability card starts
  // lying about a channel nothing writes". Nine presets declare
  // `supportsMcp: true` while one is wired, so before this guard EIGHT engines
  // rendered `MCP 6 safe` out of the box while their agents were spawned with
  // zero MCP servers. That is the out-of-the-box state, not an edge case, and
  // it is the exact failure PARITY-01b exists to prevent.
  //
  // `provider` is optional so a caller that has not resolved one keeps the old
  // behaviour rather than silently losing its card; AgentCard always passes it.
  if (opts.provider !== undefined && !mcpWiredFor(opts.provider)) return null;
  const safeCount = MCP_CATALOG.filter(
    (e) => e.tier === 'safe-readonly' && (cfg.mcpDefaults[e.id]?.enabled ?? e.defaultEnabled)
  ).length;
  const agentState = cfg.agents[agentId];
  if (!agentState) return { safeCount, granted: [] };
  const granted: McpCardMark[] = [];
  for (const entry of MCP_CATALOG) {
    const g = agentState.granted.find((x) => x.id === entry.id);
    if (!g) continue;
    const pending = Boolean(opts.ptyId) && !agentState.armed.includes(entry.id);
    const requiresSecret = Object.keys(entry.spec.env ?? {}).length > 0;
    const mark: McpMark = pending ? '↻' : !requiresSecret ? null : g.hasSecret ? '⚿' : '⚠';
    granted.push({ id: entry.id, short: shortMcpId(entry.id), tier: entry.tier, mark, pending });
  }
  return { safeCount, granted };
}
