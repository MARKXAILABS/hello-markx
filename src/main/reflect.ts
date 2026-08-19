/**
 * MemoryReflector — the missing CONDENSE half of the janitor.
 *
 * The janitor flags an oversized `agents/<id>/memory.md` ("Needs condensing.")
 * but never shrinks it. This service finishes that job: on an in-process timer it
 * finds memory files that crossed a size/section threshold and rewrites them into
 * a bounded 3-region shape — pinned durable facts (never touched), one rolling
 * recursive summary, and the newest K verbatim sections — by having Haiku
 * summarize the evicted tail.
 *
 * That summarization is NOT headless `claude -p`: runHiddenClaude spawns a full
 * ephemeral interactive PTY (see hiddenClaude.ts), deliberately, so the call
 * draws on the user's interactive plan quota instead of metered Agent SDK
 * credit. The cost model follows from that — the tokens are already paid for,
 * but each condense pays a whole TUI boot + idle-settle in wall-clock (and one
 * session slot), which is why the thresholds are conservative and why a
 * repeatedly-failing file gets backed off rather than retried every interval.
 *
 * Why in-process (Electron main), NOT launchd: launchd-spawned shells are blocked
 * by macOS TCC from `~/Documents`; only this process has the folder grant. So the
 * loop lives alongside `memory.start()` — never a cron.
 *
 * Safety is layered so a bad LLM pass can NEVER lose data:
 *   backup-first (lossless cold copy) → verify-don't-trust gate → atomic swap.
 * If any check fails the original file is left byte-for-byte untouched and the
 * only side effect is a `condense-abort` log line. On a successful rewrite the
 * `onCondensed` hook re-mines that agent's wing immediately — the mtime change
 * would get there on the miner's next tick anyway, but until it does the palace
 * still serves the text we just evicted (memory.ts).
 *
 * Runs in the Electron main process.
 */
import {
  existsSync, statSync, readdirSync, readFileSync, writeFileSync,
  mkdirSync, copyFileSync, renameSync, openSync, fsyncSync, closeSync, rmSync
} from 'node:fs';
import { join, dirname } from 'node:path';
import { runHiddenClaude } from './hiddenClaude';
import { resolveCommand } from './shellEnv';

/** Total memory.md budget — mirrors the janitor's CONTEXT_BUDGET_BYTES (128 KB). */
const BUDGET_BYTES = 131_072;
/** Cheap tail-summarizer (DECIDED by god). The verify gate covers quality. */
const CONDENSE_MODEL = 'claude-haiku-4-5';
/** Hard cap so a wedged hidden run can't stall the reflect loop. */
const DEFAULT_TIMEOUT_MS = 180_000;
/** How many `hive/backups/<stamp>/` generations to keep. Every condense ATTEMPT
 *  writes a full copy of every memory.md it touches (up to 128 KB each) and
 *  nothing ever removed them, so the directory grew without bound inside the
 *  hive repo. Twenty is far more history than a condense ever needs to undo. */
const KEEP_BACKUPS = 20;
/** First retry delay after a failed condense, doubling per consecutive failure
 *  up to BACKOFF_MAX_MS. A file that reliably fails — the model keeps answering
 *  with a heading, the rewrite never verifies — used to burn one whole session
 *  every interval, forever. */
const BACKOFF_BASE_MS = 60 * 60_000;
const BACKOFF_MAX_MS = 24 * 60 * 60_000;

/** The fixed region headings of the bounded memory shape (the stable contract). */
const PINNED_HEADING = '## 📌 Durable facts (pinned — never condensed)';
const CONDENSED_HEADING = '## 🗜 Condensed history';
const RECENT_HEADING = '## Recent';

/** Instruction prefix — kept byte-identical across calls (no dates/ids spliced
 *  in) so Claude Code prompt-caches it; the dynamic content goes in the tail. */
const CONDENSE_SYSTEM = [
  "You are compacting one AI agent's long-term memory file. You will receive:",
  '(A) the current CONDENSED summary, (B) older RECENT sections being evicted,',
  '(C) the PINNED durable-facts block (for context only — do not rewrite it).',
  'Produce STRICT JSON: {"condensed": "<text>", "hoist": ["<line>", ...]}.',
  'RULES:',
  '- "condensed" = a single bounded summary of (A)+(B). Re-summarize (A) together',
  '  with (B) so the result does not grow unbounded. Target <= 1500 words. Preserve',
  '  every decision, root cause, protocol, file path, commit SHA, and numeric result.',
  '  Drop routine standup chatter, resolved blockers, and superseded plans.',
  '- "hoist" = any NEW high-importance durable fact found in (B) that belongs in the',
  '  pinned block and is not already in (C). Lines only; may be empty.',
  '- Output ONLY the JSON object. No prose, no code fence.'
].join('\n');

export interface ReflectSettings {
  enabled: boolean;
  /** How often to scan for oversized memory files. */
  intervalMs: number;
  /** Condense when bytes exceed this percent of BUDGET_BYTES. */
  byteTriggerPct: number;
  /** ...OR when `## ` section count exceeds this (AND bytes > minBytes). */
  sectionTrigger: number;
  /** Newest K verbatim `## ` sections always kept untouched. */
  recentKeep: number;
  /** Never condense a file smaller than this — both a "don't waste an LLM call"
   *  guard and the byte floor for the section-count trigger. */
  minBytes: number;
}

/** A `## ` section: its heading line and the body text beneath it. */
interface Section { heading: string; body: string }

/** A parsed memory.md split into the three regions. `pinned`/`condensed` are null
 *  for legacy (un-structured) files — they're created on first condense. */
interface Parsed {
  header: string;            // the `# Memory …` H1 + any preamble before the first `##`
  pinned: string | null;     // body under the pinned heading (no heading line)
  condensed: string | null;  // body under the condensed heading
  recent: Section[];         // every other `## ` section, in file order (oldest→newest)
}

/** Outcome of one agent's reflect attempt — surfaced to the manual IPC + tests. */
export interface ReflectResult {
  id: string;
  condensed: boolean;        // did we actually rewrite the file?
  reason: string;            // why (skipped/aborted/done), for logging + UI
  oldBytes?: number;
  newBytes?: number;
}

export class MemoryReflector {
  private timer: NodeJS.Timeout | null = null;
  private started = false;
  /** True while a reflectNow() pass is in flight — serializes the loop (a slow
   *  LLM pass must not overlap the next interval tick), mirroring MemoryManager. */
  private reflecting = false;
  /** agentId → consecutive failures + the earliest time to try again. */
  private backoff = new Map<string, { fails: number; nextAt: number }>();
  /** One log line per process when the floor has no claude — not one per tick. */
  private warnedNoClaude = false;

  /**
   * @param getHome      Lazily resolve harnessHome so reflection follows config.
   * @param getCommand   The base `claude` command (only its binary name is used).
   * @param getMemoryEnv Extra env (the shared MemPalace path) merged into the call.
   * @param getSettings  Reflect tunables (interval + thresholds), read each tick.
   * @param appendLog    Sink for `condense`/`condense-abort` events (hive log.jsonl).
   * @param onCondensed  Optional: fired with the agent id after a file is actually
   *                     rewritten, so the semantic index can re-mine that wing —
   *                     the evicted text is still in the palace until it does.
   */
  constructor(
    private getHome: () => string | null,
    private getCommand: () => string,
    private getMemoryEnv: () => Record<string, string>,
    private getSettings: () => ReflectSettings,
    private appendLog: (event: Record<string, unknown>) => void,
    private onCondensed?: (id: string) => void
  ) {}

  // — lifecycle (mirrors MemoryManager) —

  start(): void {
    if (this.started) return;
    if (!this.getSettings().enabled) return;
    if (!this.getHome()) return;
    this.started = true;
    // First scan one interval out, not on boot, so launch isn't competing with an
    // LLM call (and a freshly-restored home isn't condensed before it's mined).
    const ms = Math.max(60_000, this.getSettings().intervalMs);
    this.timer = setInterval(() => { void this.reflectNow(); }, ms);
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.started = false;
  }

  // — scan —

  /** Reflect every agent whose memory crossed a threshold (or just `onlyId`),
   *  one at a time. Serialized via `reflecting` so a slow pass can't overlap the
   *  next tick. Returns the per-agent outcomes (used by the manual IPC + tests). */
  async reflectNow(onlyId?: string): Promise<ReflectResult[]> {
    const home = this.getHome();
    if (!home) return [];
    if (this.reflecting) return [];
    // Nothing below can work without the Claude CLI — the condense session is
    // driven with Claude-only flags. Check ONCE per pass, before any file I/O.
    if (!claudeAvailable(this.getCommand())) {
      // Warn once: an unexplained "my memory never condenses" is otherwise
      // invisible, since the loop just keeps ticking over an empty pass.
      if (!this.warnedNoClaude) {
        this.warnedNoClaude = true;
        console.warn(`[reflect] no usable claude CLI for "${this.getCommand()}" — memory condensing is off`);
      }
      return onlyId ? [{ id: onlyId, condensed: false, reason: 'no-claude-cli' }] : [];
    }
    const agentsDir = join(home, 'hive', 'agents');
    if (!existsSync(agentsDir)) return [];
    const settings = this.getSettings();
    let ids: string[];
    try { ids = readdirSync(agentsDir); } catch { return []; }
    if (onlyId) ids = ids.filter((id) => id === onlyId);

    this.reflecting = true;
    const results: ReflectResult[] = [];
    try {
      for (const id of ids) {
        // A manual call is the user asking — it ignores both the trigger and
        // the backoff. The autonomous loop honors both.
        if (!onlyId && (this.backoff.get(id)?.nextAt ?? 0) > Date.now()) continue;
        const mem = join(agentsDir, id, 'memory.md');
        if (!existsSync(mem)) continue;
        let bytes = 0;
        let text = '';
        try {
          bytes = statSync(mem).size;
          if (!onlyId && !this.shouldCondense(bytes, mem, settings)) continue;
          text = readFileSync(mem, 'utf8');
        } catch { continue; }
        const result = await this.condense(home, id, mem, text, settings);
        this.noteOutcome(result);
        results.push(result);
      }
    } finally {
      this.reflecting = false;
    }
    return results;
  }

  /** Record the attempt against the per-agent backoff. `nothing-to-evict` is a
   *  free deterministic skip (no session spawned) — everything else that failed
   *  cost a real attempt, so double the wait before the next one. */
  private noteOutcome(r: ReflectResult): void {
    if (r.condensed) { this.backoff.delete(r.id); return; }
    if (r.reason === 'nothing-to-evict') return;
    const fails = (this.backoff.get(r.id)?.fails ?? 0) + 1;
    const wait = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (fails - 1));
    this.backoff.set(r.id, { fails, nextAt: Date.now() + wait });
  }

  /** The dual trigger (DECIDED): bytes > pct% of budget, OR many-section sprawl
   *  above the byte floor. The floor doubles as the "never burn an LLM call on a
   *  tiny file" guard, so it gates BOTH paths. */
  private shouldCondense(bytes: number, mem: string, s: ReflectSettings): boolean {
    if (bytes < s.minBytes) return false;
    if (bytes > (BUDGET_BYTES * s.byteTriggerPct) / 100) return true;
    let sections = 0;
    try { sections = countSections(readFileSync(mem, 'utf8')); } catch { return false; }
    return sections > s.sectionTrigger;
  }

  // — condense one file —

  private async condense(
    home: string, id: string, mem: string, text: string, s: ReflectSettings
  ): Promise<ReflectResult> {
    const oldBytes = Buffer.byteLength(text, 'utf8');
    const parsed = parseMemory(text);
    // Split recent into KEEP (newest K, verbatim) and EVICT (older — summarized).
    const keepCount = Math.max(1, s.recentKeep);
    const keep = parsed.recent.slice(-keepCount);
    const evict = parsed.recent.slice(0, Math.max(0, parsed.recent.length - keepCount));
    if (evict.length === 0) {
      return { id, condensed: false, reason: 'nothing-to-evict', oldBytes };
    }

    // 1) BACK UP first — a lossless cold copy makes every later step recoverable.
    const stamp = utcStamp();
    const backup = join(home, 'hive', 'backups', stamp, id, 'memory.md');
    try {
      mkdirSync(dirname(backup), { recursive: true });
      copyFileSync(mem, backup);
    } catch (e) {
      this.logAbort(id, 'backup-failed', String(e));
      return { id, condensed: false, reason: 'backup-failed', oldBytes };
    }
    pruneBackups(join(home, 'hive', 'backups'));

    // 2) SUMMARIZE the (condensed + evicted) tail via headless Haiku.
    let summary: { condensed: string; hoist: string[] };
    try {
      summary = await this.summarize(home, parsed.condensed, evict, parsed.pinned);
    } catch (e) {
      this.logAbort(id, 'summarize-failed', String(e));
      return { id, condensed: false, reason: 'summarize-failed', oldBytes };
    }

    // 3) REBUILD into the 3-region shape.
    const oldPinnedLines = pinnedLines(parsed.pinned);
    const mergedPinned = mergePinned(oldPinnedLines, summary.hoist);
    const rebuilt = rebuild(parsed.header, mergedPinned, summary.condensed, keep);
    const newBytes = Buffer.byteLength(rebuilt, 'utf8');

    // 4) VERIFY-DON'T-TRUST — reject the rewrite unless every check holds.
    const verdict = verify({
      rebuilt, newBytes, oldBytes, oldPinnedLines, mergedPinned,
      condensed: summary.condensed, keep
    });
    if (!verdict.ok) {
      this.logAbort(id, verdict.reason, undefined, { oldBytes, newBytes });
      return { id, condensed: false, reason: verdict.reason, oldBytes, newBytes };
    }

    // 5) ATOMIC SWAP — write a temp sibling, fsync, rename over the original.
    try {
      atomicWrite(mem, rebuilt);
    } catch (e) {
      this.logAbort(id, 'swap-failed', String(e), { oldBytes, newBytes });
      return { id, condensed: false, reason: 'swap-failed', oldBytes, newBytes };
    }

    try {
      this.appendLog({
        kind: 'condense', agentId: id, oldBytes, newBytes,
        evicted: evict.length, kept: keep.length, hoisted: summary.hoist.length, backup
      });
    } catch { /* logging is best-effort */ }
    // Re-index NOW rather than waiting for the miner's mtime tick: until the wing
    // is re-mined, every chunk we just evicted is still searchable in the palace
    // and still outranking the summary that replaced it.
    try { this.onCondensed?.(id); } catch { /* best-effort */ }
    return { id, condensed: true, reason: 'condensed', oldBytes, newBytes };
  }

  private logAbort(id: string, reason: string, detail?: string, extra?: Record<string, unknown>): void {
    try { this.appendLog({ kind: 'condense-abort', agentId: id, reason, ...(detail ? { detail } : {}), ...extra }); }
    catch { /* best-effort */ }
  }

  // — the headless LLM call (the only non-deterministic step) —

  private async summarize(
    home: string, condensed: string | null, evict: Section[], pinned: string | null
  ): Promise<{ condensed: string; hoist: string[] }> {
    const evictText = evict.map((s) => `${s.heading}\n${s.body}`).join('\n\n').trim();
    const prompt = [
      CONDENSE_SYSTEM,
      '',
      '--- INPUT ---',
      '(A) CURRENT CONDENSED SUMMARY:',
      condensed?.trim() || '(none yet)',
      '',
      '(B) OLDER SECTIONS BEING EVICTED:',
      evictText || '(none)',
      '',
      '(C) PINNED DURABLE FACTS (context only — do not rewrite):',
      pinned?.trim() || '(none)'
    ].join('\n');

    const result = await runHiddenClaude(prompt, {
      model: CONDENSE_MODEL,
      cwd: home,
      command: this.getCommand(),
      // Pure text transform — must never touch the repo, shell out, or reach the
      // network. The input is one agent's own notes, which may quote web pages it
      // scraped; the session runs with permissions bypassed, so a prompt injection
      // hiding in them would otherwise have WebFetch to post the pinned durable
      // facts it was just handed. (hiddenClaude unions the network tools in too —
      // they are named here because THIS call is the one holding the secrets.)
      disallowedTools: ['Edit', 'Write', 'NotebookEdit', 'Bash', 'WebFetch', 'WebSearch', 'Task'],
      env: this.getMemoryEnv(),
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });

    if (!result.ok || !result.text) {
      throw new Error(result.error ?? 'condense: hidden session returned no text');
    }
    const parsed = parseSummary(result.text);
    if (!parsed) throw new Error('condense: response contained no parseable JSON');
    return parsed;
  }
}

// ─── pure helpers (the deterministic, unit-testable half) ────────────────────

/** Count level-2 (`## `) headings — `# ` H1 and `### ` deeper headings excluded. */
export function countSections(text: string): number {
  return (text.match(/^##\s/gm) ?? []).length;
}

/** Split a memory.md into header + the three regions. A legacy flat file (no
 *  pinned/condensed headings) parses with those null and every `## ` section in
 *  `recent`; the structured blocks are created on first condense. */
export function parseMemory(text: string): Parsed {
  const lines = text.split('\n');
  let firstSection = lines.findIndex((l) => /^##\s/.test(l));
  if (firstSection === -1) firstSection = lines.length;
  const header = lines.slice(0, firstSection).join('\n').replace(/\s+$/, '');

  // Carve the remaining lines into `## ` sections (heading + body until next `##`).
  const sections: Section[] = [];
  let cur: Section | null = null;
  for (let i = firstSection; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s/.test(line)) {
      if (cur) sections.push(cur);
      cur = { heading: line, body: '' };
    } else if (cur) {
      cur.body += (cur.body ? '\n' : '') + line;
    }
  }
  if (cur) sections.push(cur);

  let pinned: string | null = null;
  let condensed: string | null = null;
  const recent: Section[] = [];
  for (const s of sections) {
    const h = s.heading.trim();
    if (h.startsWith('## 📌')) pinned = s.body.replace(/\s+$/, '');
    else if (h.startsWith('## 🗜')) condensed = s.body.replace(/\s+$/, '');
    else if (h === RECENT_HEADING) { /* divider — its siblings ARE the recent list */ }
    else recent.push(s);
  }
  return { header, pinned, condensed, recent };
}

/** Non-empty, trimmed lines of the pinned block (the set we must never lose). */
export function pinnedLines(pinned: string | null): string[] {
  if (!pinned) return [];
  return pinned.split('\n').map((l) => l.trim()).filter(Boolean);
}

/** Append hoisted durable facts to the pinned set, skipping any already present. */
export function mergePinned(oldLines: string[], hoist: string[]): string[] {
  const have = new Set(oldLines);
  const out = [...oldLines];
  for (const raw of hoist) {
    const line = (raw ?? '').trim();
    if (line && !have.has(line)) { have.add(line); out.push(line); }
  }
  return out;
}

/** Reassemble the canonical 3-region file. */
export function rebuild(header: string, pinned: string[], condensed: string, keep: Section[]): string {
  const parts: string[] = [];
  if (header.trim()) parts.push(header.trim());
  parts.push(PINNED_HEADING);
  parts.push(pinned.length ? pinned.join('\n') : '_(none yet)_');
  parts.push(CONDENSED_HEADING);
  parts.push(condensed.trim());
  parts.push(RECENT_HEADING);
  for (const s of keep) parts.push(`${s.heading}\n${s.body}`.replace(/\s+$/, ''));
  return parts.join('\n\n') + '\n';
}

/** The verify-don't-trust gate. The rewrite is rejected — original kept verbatim
 *  — unless ALL checks pass. The lossless backup makes a rejection a pure no-op. */
export function verify(args: {
  rebuilt: string; newBytes: number; oldBytes: number;
  oldPinnedLines: string[]; mergedPinned: string[];
  condensed: string; keep: Section[];
}): { ok: true } | { ok: false; reason: string } {
  const { rebuilt, newBytes, oldBytes, oldPinnedLines, mergedPinned, condensed, keep } = args;
  // 6) Valid summary JSON already enforced upstream (parseSummary). Here: structure.
  // 1) Parses back into the 3-region structure.
  const re = parseMemory(rebuilt);
  if (re.pinned === null || re.condensed === null) return { ok: false, reason: 'structure-missing-region' };
  // 4) Non-empty + sane.
  if (newBytes <= 200) return { ok: false, reason: 'too-small' };
  if (!condensed.trim()) return { ok: false, reason: 'empty-condensed' };
  // 3) Actually smaller (a no-op condense is a failure).
  if (!(newBytes < oldBytes * 0.95)) return { ok: false, reason: 'not-smaller' };
  // 2) Pinned preserved: every old pinned line survives (hoist only adds).
  const newPinned = new Set(pinnedLines(re.pinned));
  for (const line of oldPinnedLines) if (!newPinned.has(line)) return { ok: false, reason: 'pinned-line-dropped' };
  for (const line of mergedPinned) if (!newPinned.has(line)) return { ok: false, reason: 'pinned-merge-mismatch' };
  // 5) Recent integrity: the kept newest sections round-trip byte-for-byte.
  if (re.recent.length !== keep.length) return { ok: false, reason: 'recent-count-mismatch' };
  for (let i = 0; i < keep.length; i++) {
    const a = `${keep[i].heading}\n${keep[i].body}`.replace(/\s+$/, '');
    const b = `${re.recent[i].heading}\n${re.recent[i].body}`.replace(/\s+$/, '');
    if (a !== b) return { ok: false, reason: 'recent-section-altered' };
  }
  return { ok: true };
}

/** Pull `{condensed, hoist}` out of the hidden session's final assistant text.
 *  Two layers, because the same helper also parses a `--output-format json` CLI
 *  envelope `{result: "<text>"}` if one ever shows up: unwrap that if present,
 *  then the model's strict JSON (tolerating an accidental ```json fence).
 *  Returns null on any failure. */
export function parseSummary(stdout: string): { condensed: string; hoist: string[] } | null {
  const raw = stdout.trim();
  if (!raw) return null;
  let inner = raw;
  try {
    const env = JSON.parse(raw) as { result?: unknown; text?: unknown };
    if (typeof env.result === 'string') inner = env.result;
    else if (typeof env.text === 'string') inner = env.text;
  } catch { /* not the CLI envelope — treat stdout itself as the model output */ }
  inner = inner.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    const obj = JSON.parse(inner) as { condensed?: unknown; hoist?: unknown };
    if (typeof obj.condensed !== 'string' || !obj.condensed.trim()) return null;
    const hoist = Array.isArray(obj.hoist) ? obj.hoist.filter((x): x is string => typeof x === 'string') : [];
    return { condensed: obj.condensed, hoist };
  } catch { return null; }
}

/** Can this floor actually run a condense? The pass drives the CLAUDE CLI
 *  specifically — `--model claude-haiku-4-5`, `--permission-mode`,
 *  `--disallowedTools` are its flags, not a shared contract — but the command it
 *  gets is the floor's `defaultCommand`, which may be codex/gemini/qwen or a
 *  claude that was never installed. Both cases used to spawn a doomed PTY every
 *  interval, forever. Cheap enough to re-ask each pass (once per intervalMs), so
 *  installing claude mid-session starts working on its own. */
export function claudeAvailable(command: string): boolean {
  const binary = (command || 'claude').trim().split(/\s+/)[0] || 'claude';
  // Name check first — it costs nothing and rules out every non-Claude engine
  // before we pay for a PATH probe.
  if (!/(^|[\\/])claude(\.[a-z]+)?$/i.test(binary)) return false;
  // resolveCommand hands back the input unchanged when it can't resolve it, and
  // every path it DOES return was existsSync-checked, so this one test covers both.
  return existsSync(resolveCommand(binary));
}

/** Keep only the newest KEEP_BACKUPS `hive/backups/<stamp>/` generations.
 *  Stamps are `20260606T110912Z`, so lexicographic sort IS chronological.
 *  Best-effort: a backup we fail to delete is never worth failing a condense. */
function pruneBackups(root: string): void {
  try {
    const stamps = readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    for (const old of stamps.slice(0, Math.max(0, stamps.length - KEEP_BACKUPS))) {
      try { rmSync(join(root, old), { recursive: true, force: true }); } catch { /* next time */ }
    }
  } catch { /* no backups dir yet, or unreadable — nothing to prune */ }
}

/** `20260606T110912Z` — matches the janitor's backup-dir stamp format. */
function utcStamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** Write `text` to `path` atomically: temp sibling → fsync → rename over target. */
function atomicWrite(path: string, text: string): void {
  const tmp = `${path}.tmp-${Math.random().toString(36).slice(2, 10)}`;
  writeFileSync(tmp, text, 'utf8');
  try {
    const fd = openSync(tmp, 'r+');
    try { fsyncSync(fd); } finally { closeSync(fd); }
  } catch { /* fsync best-effort; rename is the durability guarantee */ }
  renameSync(tmp, path);
}
