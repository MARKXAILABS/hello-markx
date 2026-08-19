/**
 * MemoryManager — semantic memory for the hive, backed by the MemPalace CLI.
 *
 * CLI-only (no MCP): the harness keeps a single shared palace under harnessHome,
 * points every agent's `MEMPALACE_PALACE_PATH` at it, and mines each agent's
 * `memory.md` into its own wing so the whole team can recall by meaning via
 * `mempalace search` / `mempalace wake-up`. Degrades silently to no-op when the
 * `mempalace` CLI isn't installed — the markdown memory still works.
 *
 *   init    : mempalace init <home> --yes --no-llm        (heuristics-only, no LLM)
 *   store   : mempalace mine <agentDir> --wing <id> --agent <id>
 *   recall  : mempalace search "<q>" --results N   /   mempalace wake-up
 *
 * Runs in the Electron main process.
 */
import { existsSync, statSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { ensureKilled } from './procKill';

/** Non-memory files `mempalace mine` must not ingest: the Claude Code hooks
 *  config (a large JSON blob that swamps the wake-up digest), the cursor, and
 *  raw inbox/outbox message JSON. `mempalace mine` honors .gitignore, so we drop
 *  one in each agent dir rather than touch the mine command.
 *
 *  The dot-dirs matter as much as the JSON: an agent folder also holds the
 *  BUNDLED SKILLS copied into `.claude/skills/` plus each engine's own state
 *  (`.codex/`, `.pi-agent/`, `.opencode/`, crush). Mining those indexes the
 *  harness's own documentation as if it were the agent's memory, and it then
 *  outranks the agent's real notes in every recall. Only `memory.md` (and its
 *  identity header) is memory. */
const MINE_IGNORE_LINES = [
  'settings.json', 'cursor.json', 'inbox/', 'outbox/',
  '.claude/', '.codex/', '.pi-agent/', '.opencode/', '.crush-data/', 'crush.json'
];

/** Idempotently ensure `<agentDir>/.gitignore` excludes the non-memory files.
 *  Writes only the missing lines (append-only) so it's safe to call every cycle. */
function ensureMineIgnore(agentDir: string): void {
  const path = join(agentDir, '.gitignore');
  let existing = '';
  try { if (existsSync(path)) existing = readFileSync(path, 'utf8'); } catch { return; }
  const have = new Set(existing.split('\n').map((l) => l.trim()));
  const missing = MINE_IGNORE_LINES.filter((l) => !have.has(l));
  if (missing.length === 0) return; // already covered — don't rewrite every cycle
  const prefix = existing && !existing.endsWith('\n') ? existing + '\n' : existing;
  try { writeFileSync(path, prefix + missing.join('\n') + '\n', 'utf8'); } catch { /* best-effort */ }
}

export type EmbeddingModel = 'minilm' | 'embeddinggemma';

export interface MemorySettings {
  enabled: boolean;
  model: EmbeddingModel;
}

export interface MemoryStatus {
  available: boolean;        // mempalace CLI found on PATH
  enabled: boolean;          // user setting
  active: boolean;           // available && enabled && have a home
  initialized: boolean;      // palace directory exists
  palacePath: string | null;
  model: EmbeddingModel;
  bin: string | null;
}

const MINE_INTERVAL_MS = 180_000; // re-mine changed memories every 3 min
const MINE_TIMEOUT_MS = 10 * 60_000; // hard cap per mine (first run downloads the embedding model)
/** Floor between two PATH probes. Resolution costs a 3 s login-shell spawn on
 *  the MAIN process and the memoryStatus IPC asks for a fresh one on every
 *  MemoryPanel mount/toggle — a miss must not be re-probed per click. */
const BIN_RECHECK_MS = 30_000;

// ─── binary resolution (module-level: one probe per process, not per manager) ──

let binCache: string | null | undefined;
let binProbedAt = 0;

/**
 * Absolute path to the `mempalace` CLI, or null when it isn't installed.
 *
 * Module-level and cached: agents are told to run a BARE `mempalace`, resolved
 * against the PTY's PATH, which is not the same set of places this probe looks
 * (uv/brew/pip shims often aren't on a GUI-launched app's PATH, and vice versa).
 * Baking this absolute path into the injected agent prompt — exactly what the
 * knowledge graph already does with KG_CLI — is what makes the green READY dot
 * mean "the command the agent was told to type actually resolves".
 */
export function memoryBin(): string | null {
  if (binCache !== undefined) return binCache;
  binProbedAt = Date.now();
  let found: string | null = null;
  const isWin = process.platform === 'win32';
  // 1) Ask the shell/PATH resolver. Windows has no POSIX shell + uses `where`
  //    and a `.exe` suffix; everything else goes through the login shell.
  try {
    if (isWin) {
      const res = spawnSync('where', ['mempalace'], { encoding: 'utf8', timeout: 3000 });
      const p = res.stdout?.trim().split(/\r?\n/)[0]?.trim();
      if (p && existsSync(p)) found = p;
    } else {
      const res = spawnSync(process.env.SHELL ?? '/bin/zsh', ['-ilc', 'which mempalace'], {
        encoding: 'utf8', timeout: 3000
      });
      const p = res.stdout?.trim().split('\n').pop();
      if (p && existsSync(p)) found = p;
    }
  } catch { /* fall through */ }
  // 2) Probe common install locations (uv tool / homebrew / pip).
  if (!found) {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
    const candidates = isWin
      ? [
          join(home, '.local', 'bin', 'mempalace.exe'),
          join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Python', 'Scripts', 'mempalace.exe')
        ]
      : [
          `${home}/.local/bin/mempalace`,
          '/opt/homebrew/bin/mempalace',
          '/usr/local/bin/mempalace'
        ];
    for (const c of candidates) if (c && existsSync(c)) { found = c; break; }
  }
  binCache = found;
  return found;
}

/** Invalidate the resolved path so the next memoryBin() probes again — but only
 *  when probing can change the answer. A cached path that still exists cannot
 *  have moved, and a miss is re-probed at most every BIN_RECHECK_MS, so the
 *  "user just installed mempalace" case still recovers without paying a 3 s
 *  main-process stall for every panel toggle. */
export function resetMemoryBin(): void {
  if (binCache && existsSync(binCache)) return;
  if (binCache !== undefined && Date.now() - binProbedAt < BIN_RECHECK_MS) return;
  binCache = undefined;
}

export class MemoryManager {
  private mineTimer: NodeJS.Timeout | null = null;
  private initStarted = false;
  /** True while a mineNow() pass is in flight — serializes palace writers. */
  private mining = false;
  /** agentId → memory.md mtimeMs at last successful mine (skip unchanged). */
  private lastMined = new Map<string, number>();

  constructor(
    private getHome: () => string | null,
    private getSettings: () => MemorySettings
  ) {}

  palacePath(): string | null {
    const h = this.getHome();
    return h ? join(h, 'palace') : null;
  }

  /** Resolve the mempalace CLI against the user's PATH + common uv/pip spots. */
  bin(): string | null { return memoryBin(); }
  /** Force re-resolution (e.g. after the user installs mempalace). */
  resetBinCache(): void { resetMemoryBin(); }

  available(): boolean { return this.bin() !== null; }
  enabled(): boolean { return this.getSettings().enabled; }
  active(): boolean { return this.available() && this.enabled() && this.getHome() !== null; }
  model(): EmbeddingModel { return this.getSettings().model === 'embeddinggemma' ? 'embeddinggemma' : 'minilm'; }

  status(): MemoryStatus {
    const palace = this.palacePath();
    return {
      available: this.available(),
      enabled: this.enabled(),
      active: this.active(),
      initialized: !!palace && existsSync(palace),
      palacePath: palace,
      model: this.model(),
      bin: this.bin()
    };
  }

  /** Env merged into each agent's spawn so its `mempalace` CLI hits the shared palace. */
  env(): Record<string, string> {
    const palace = this.palacePath();
    if (!this.active() || !palace) return {};
    return { MEMPALACE_PALACE_PATH: palace, MEMPALACE_EMBEDDING_MODEL: this.model() };
  }

  private childEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      MEMPALACE_PALACE_PATH: this.palacePath() ?? '',
      MEMPALACE_EMBEDDING_MODEL: this.model()
    };
  }

  // — lifecycle —

  /** Start the mine loop. `mempalace mine` auto-creates the palace on first run
   *  (lazily downloading the embedding model, one-time). We deliberately do NOT
   *  run `mempalace init`: it ends in an interactive "Mine now? [Y/n]" prompt
   *  that --yes doesn't cover, so a spawned child would hang forever. */
  start(): void {
    if (!this.active() || this.initStarted) return;
    if (!this.bin() || !this.getHome() || !this.palacePath()) return;
    this.initStarted = true;
    this.startMineLoop();
  }

  stop(): void {
    if (this.mineTimer) { clearInterval(this.mineTimer); this.mineTimer = null; }
  }

  private startMineLoop(): void {
    if (this.mineTimer) return;
    this.mineNow();
    this.mineTimer = setInterval(() => this.mineNow(), MINE_INTERVAL_MS);
  }

  // — mining (store) —

  /** Mine every agent whose memory changed since last time, one at a time.
   *  The palace permits a single writer, so mines MUST be serialized — firing
   *  them concurrently makes all but one fail with "held by another writer".
   *  `mining` guards against a slow pass overlapping the next interval tick. */
  async mineNow(): Promise<void> {
    const home = this.getHome();
    const bin = this.bin();
    if (!this.active() || !home || !bin) return;
    if (this.mining) return; // a previous pass is still running — let it finish
    const agentsDir = join(home, 'hive', 'agents');
    if (!existsSync(agentsDir)) return;
    let ids: string[];
    try { ids = readdirSync(agentsDir); } catch { return; }
    this.mining = true;
    try {
      for (const id of ids) {
        const agentDir = join(agentsDir, id);
        const mem = join(agentDir, 'memory.md');
        if (!existsSync(mem)) continue;
        let mtime = 0;
        try { mtime = statSync(mem).mtimeMs; } catch { continue; }
        if (this.lastMined.get(id) === mtime) continue; // unchanged — skip the model load
        this.lastMined.set(id, mtime);
        await this.mineAgent(agentDir, id); // one writer at a time
      }
    } finally {
      this.mining = false;
    }
  }

  /** Re-mine ONE agent's wing right now, ignoring the mtime cache.
   *
   *  Called after a condense rewrites `memory.md`: everything the reflector
   *  evicted is still sitting in the palace, so until the wing is mined against
   *  the NEW file, `mempalace search` keeps returning superseded decisions that
   *  no longer exist in the memory they came from. The mine loop would get there
   *  within ~3 min on the mtime change, but a rewrite is exactly the moment the
   *  index is most wrong, so don't wait for the tick. */
  async remineAgent(id: string): Promise<void> {
    const home = this.getHome();
    if (!this.active() || !home || !id) return;
    this.lastMined.delete(id); // stale either way — the next tick retries if we bail
    const agentDir = join(home, 'hive', 'agents', id);
    const mem = join(agentDir, 'memory.md');
    if (!existsSync(mem)) return;
    if (this.mining) return; // single writer — the in-flight pass or next tick covers it
    this.mining = true;
    try {
      try { this.lastMined.set(id, statSync(mem).mtimeMs); } catch { this.lastMined.delete(id); }
      await this.mineAgent(agentDir, id);
    } finally {
      this.mining = false;
    }
  }

  private mineAgent(agentDir: string, id: string): Promise<void> {
    return new Promise((resolve) => {
      const bin = this.bin();
      if (!bin) { resolve(); return; }
      ensureMineIgnore(agentDir); // keep settings.json / cursor / messages out of the index
      // stdin closed (mempalace can prompt); mempalace dedups so re-mining is safe.
      const proc = spawn(bin, ['mine', agentDir, '--wing', id, '--agent', id], {
        env: this.childEnv(), stdio: ['ignore', 'ignore', 'pipe']
      });
      let err = '';
      proc.stderr?.on('data', (d) => { err += d.toString(); });
      // Hard ceiling: a wedged mine used to hold its PID forever AND leave
      // `mining` stuck true, silently stopping all future passes. Generous cap
      // because the first run may lazily download the embedding model.
      const timer = setTimeout(() => {
        console.error(`[memory] mine ${id} timed out after ${MINE_TIMEOUT_MS / 60000}min — killing`);
        try { proc.kill('SIGTERM'); } catch { /* gone */ }
        ensureKilled(proc.pid); // SIGKILL sweep if SIGTERM is ignored
      }, MINE_TIMEOUT_MS);
      timer.unref?.();
      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          console.error(`[memory] mine ${id} exited ${code}: ${err.slice(-300)}`);
          this.lastMined.delete(id); // let the next tick retry
        }
        resolve();
      });
      proc.on('error', () => { clearTimeout(timer); this.lastMined.delete(id); resolve(); });
    });
  }

  // — recall (read) —

  /** Run one mempalace read command asynchronously. These used to be spawnSync
   *  with a 120s timeout — on a cold model load that BLOCKED the Electron main
   *  process (renderer IPC, timers, every window) for up to two minutes. Same
   *  contract, but the event loop keeps breathing and a wedged CLI is swept. */
  private runCli(args: string[], label: string): Promise<{ ok: boolean; output: string; error?: string }> {
    return new Promise((resolve) => {
      const bin = this.bin();
      if (!this.active() || !bin) { resolve({ ok: false, output: '', error: 'semantic memory not active' }); return; }
      let proc: ReturnType<typeof spawn>;
      try {
        proc = spawn(bin, args, { env: this.childEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (e) {
        resolve({ ok: false, output: '', error: e instanceof Error ? e.message : String(e) });
        return;
      }
      let out = '', err = '';
      let settled = false;
      const settle = (r: { ok: boolean; output: string; error?: string }): void => {
        if (!settled) { settled = true; clearTimeout(timer); resolve(r); }
      };
      proc.stdout?.setEncoding('utf8');
      proc.stderr?.setEncoding('utf8');
      proc.stdout?.on('data', (d: string) => { out += d; });
      proc.stderr?.on('data', (d: string) => { err += d; });
      const timer = setTimeout(() => {
        try { proc.kill('SIGTERM'); } catch { /* gone */ }
        ensureKilled(proc.pid);
        settle({ ok: false, output: out, error: `${label} timed out` });
      }, 120_000);
      timer.unref?.();
      proc.on('close', (code) => {
        if (code !== 0) settle({ ok: false, output: out, error: (err || `${label} failed`).trim() });
        else settle({ ok: true, output: out });
      });
      proc.on('error', (e) => settle({ ok: false, output: '', error: e.message }));
    });
  }

  /** Semantic search across the shared palace. Returns the CLI's text output. */
  search(query: string, opts: { wing?: string; results?: number } = {}): Promise<{ ok: boolean; output: string; error?: string }> {
    const args = ['search', query, '--results', String(opts.results ?? 5)];
    if (opts.wing) args.push('--wing', opts.wing);
    return this.runCli(args, 'search');
  }

  /** Session-start digest (~600-900 tokens). */
  wakeUp(wing?: string): Promise<{ ok: boolean; output: string; error?: string }> {
    const args = ['wake-up'];
    if (wing) args.push('--wing', wing);
    return this.runCli(args, 'wake-up');
  }
}
