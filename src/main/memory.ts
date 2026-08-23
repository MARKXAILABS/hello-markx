/**
 * MemoryManager — semantic memory for the hive, backed by the MemPalace CLI.
 *
 * CLI-only (no MCP): the harness keeps a palace under harnessHome, points each
 * agent's `MEMPALACE_PALACE_PATH` at it, and mines that agent's `memory.md` into
 * its own wing so recall by meaning works via `mempalace search` /
 * `mempalace wake-up`. Degrades silently to no-op when the `mempalace` CLI isn't
 * installed — the markdown memory still works.
 *
 * SHARING MODEL (`MemorySettings.scope`) — this is the thing to be explicit
 * about, because the default is the permissive one:
 *   'shared' (default) — ONE palace for the whole hive. Every agent can recall
 *     every other agent's notes: that is the feature (a team that remembers
 *     together), and it is also the exposure. An agent handed a credential, a
 *     customer name, or a private instruction writes it to memory.md, the miner
 *     indexes it, and any sibling can surface it with one `mempalace search`.
 *   'agent' — one palace per agent, isolation enforced by the PATH itself rather
 *     than by asking an agent nicely to pass `--wing`. Costs an index (and a
 *     first-run embedding-model load) per agent, and cross-agent recall is gone.
 * Whichever is in force is reported in `status().scope` so the UI can say so
 * instead of leaving the user to infer it.
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
import { createHash } from 'node:crypto';
import { ensureKilled } from './procKill';
import type { PersistStore } from './db';

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
/** Who can recall whose memories. See the sharing-model note at the top. */
export type MemoryScope = 'shared' | 'agent';

export interface MemorySettings {
  enabled: boolean;
  model: EmbeddingModel;
  /** Absent → 'shared', so an existing install keeps its one palace and its
   *  cross-agent recall exactly as it was. */
  scope?: MemoryScope;
}

export interface MemoryStatus {
  available: boolean;        // mempalace CLI found on PATH
  enabled: boolean;          // user setting
  active: boolean;           // available && enabled && have a home
  initialized: boolean;      // palace directory exists
  palacePath: string | null;
  model: EmbeddingModel;
  bin: string | null;
  /** 'shared' = every agent recalls every other agent's notes. Surfaced so the
   *  UI can state the sharing model rather than leaving the user to guess. */
  scope: MemoryScope;
}

/** An agent id is about to become a directory name. Ids come off the registry —
 *  ultimately from an agent NAME the user typed — so reduce every one of them to
 *  a plain path segment: no separator, no `..`, no leading dot.
 *
 *  The usual id (`pam-m3k9x`) passes through untouched. Anything else is scrubbed
 *  AND suffixed with a hash of the original, because a name that is entirely
 *  non-Latin or emoji slugs down to nothing and two such ids must not scrub to
 *  the same folder — under 'agent' scope that would silently hand two agents one
 *  shared palace, which is the exact failure this scoping exists to prevent. */
function safeAgentSegment(id: string | undefined): string | null {
  const raw = String(id ?? '').trim();
  if (!raw) return null;
  if (/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(raw)) return raw;
  const scrubbed = raw.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[^A-Za-z0-9]+/, '').slice(0, 40);
  return `${scrubbed || 'agent'}-${createHash('sha256').update(raw).digest('hex').slice(0, 8)}`;
}

/** Longest single indexed chunk. A pathological memory.md (one 2 MB paragraph)
 *  must not put a 2 MB row in the FTS index on every mine tick. */
const MEM_CHUNK_MAX = 4_000;

/** Split memory.md into the units keyword recall returns.
 *
 *  Blank-line paragraphs, because that is what memory.md actually is: a flat
 *  markdown note file. Indexing the WHOLE file as one row would make every hit
 *  return every note the agent has ever written, which is a search result nobody
 *  can read and a prompt nobody can afford. */
function chunkMemory(text: string): string[] {
  return String(text ?? '')
    .split(/\n\s*\n/)
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => c.slice(0, MEM_CHUNK_MAX));
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
    private getSettings: () => MemorySettings,
    /** The already-open harness DB, or null. Optional so a caller that only
     *  wants the mempalace half (and every existing test) constructs unchanged;
     *  when it IS supplied, memory.md is also indexed into `memory_fts` and
     *  keywordSearch() below works with no `mempalace` on PATH at all. */
    private getStore?: () => PersistStore | null,
    /** The project an agent works in (its registry cwd), or null. Stored beside
     *  each indexed chunk so recall can be narrowed by project as well as by
     *  agent — the second half of D-33's predicate. */
    private getProject?: (agentId: string) => string | null
  ) {}

  /** The DB handle, and only once it is actually open — indexing into a closed
   *  store is a silent no-op that reads as "the index is empty" forever. */
  private store(): PersistStore | null {
    const s = this.getStore?.() ?? null;
    return s && s.isOpen ? s : null;
  }

  /** The palace ONE agent reads and writes.
   *
   *  Under 'shared' scope every id resolves to the same `<home>/palace`, which
   *  is the pre-existing path — an install that never changes the setting is
   *  byte-identical to before. Under 'agent' scope each id gets its own
   *  `<home>/palaces/<id>`, so the isolation is the path, not a `--wing` flag an
   *  agent could simply omit. Returns null when there is no home, and — under
   *  'agent' scope — when the caller supplied no usable id, because the honest
   *  answer there is "no palace", never "everybody's palace". */
  palacePath(agentId?: string): string | null {
    const h = this.getHome();
    if (!h) return null;
    if (this.scope() === 'shared') return join(h, 'palace');
    const seg = safeAgentSegment(agentId);
    return seg ? join(h, 'palaces', seg) : null;
  }

  /** Resolve the mempalace CLI against the user's PATH + common uv/pip spots. */
  bin(): string | null { return memoryBin(); }
  /** Force re-resolution (e.g. after the user installs mempalace). */
  resetBinCache(): void { resetMemoryBin(); }

  available(): boolean { return this.bin() !== null; }
  enabled(): boolean { return this.getSettings().enabled; }
  active(): boolean { return this.available() && this.enabled() && this.getHome() !== null; }
  model(): EmbeddingModel { return this.getSettings().model === 'embeddinggemma' ? 'embeddinggemma' : 'minilm'; }
  scope(): MemoryScope { return this.getSettings().scope === 'agent' ? 'agent' : 'shared'; }

  status(): MemoryStatus {
    const home = this.getHome();
    const scope = this.scope();
    // Under 'agent' scope there is no single palace to name; report the root the
    // per-agent ones live under, and count it initialized once any exists.
    const palace = scope === 'shared' ? this.palacePath() : (home ? join(home, 'palaces') : null);
    return {
      available: this.available(),
      enabled: this.enabled(),
      active: this.active(),
      initialized: !!palace && existsSync(palace),
      palacePath: palace,
      model: this.model(),
      bin: this.bin(),
      scope
    };
  }

  /** Env merged into ONE agent's spawn so its `mempalace` CLI hits the palace it
   *  is entitled to. Pass the agent's id: under 'agent' scope it selects that
   *  agent's own palace, and without it there is nothing safe to point at, so
   *  nothing is injected (the agent gets no semantic memory rather than someone
   *  else's). Under the default 'shared' scope the id is irrelevant. */
  env(agentId?: string): Record<string, string> {
    const palace = this.palacePath(agentId);
    if (!this.active() || !palace) return {};
    return { MEMPALACE_PALACE_PATH: palace, MEMPALACE_EMBEDDING_MODEL: this.model() };
  }

  private childEnv(agentId?: string): NodeJS.ProcessEnv {
    return {
      ...process.env,
      MEMPALACE_PALACE_PATH: this.palacePath(agentId) ?? '',
      MEMPALACE_EMBEDDING_MODEL: this.model()
    };
  }

  // — lifecycle —

  /** Start the mine loop. `mempalace mine` auto-creates the palace on first run
   *  (lazily downloading the embedding model, one-time). We deliberately do NOT
   *  run `mempalace init`: it ends in an interactive "Mine now? [Y/n]" prompt
   *  that --yes doesn't cover, so a spawned child would hang forever. */
  start(): void {
    if (this.initStarted || !this.enabled() || !this.getHome()) return;
    // No palacePath() check: under 'agent' scope there is no palace until an
    // agent id names one, and gating on it here would kill the mine loop outright.
    //
    // This used to require active() — i.e. the mempalace CLI — so on the COMMON
    // machine (no mempalace on PATH) the loop never started and the whole
    // subsystem was a no-op. The FTS5 index is the recall path that survives
    // that, so the loop now also starts when all we have is somewhere to put the
    // index; the CLI-only half stays gated inside mineNow().
    if (!this.active() && !this.store()) return;
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
    if (!home || !this.enabled()) return;
    // Two independent sinks now. The CLI half is unchanged and still needs
    // active() plus a resolved binary; the FTS index half needs only an open DB,
    // and running it on the machines where mempalace is absent is the whole point.
    const cli = this.active() && !!this.bin();
    if (!cli && !this.store()) return;
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
        this.indexIntoFts(id, mem); // keyword recall — no CLI required
        if (cli) await this.mineAgent(agentDir, id); // one writer at a time
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
      this.indexIntoFts(id, mem); // the condense just rewrote the file — reindex too
      await this.mineAgent(agentDir, id);
    } finally {
      this.mining = false;
    }
  }

  private mineAgent(agentDir: string, id: string): Promise<void> {
    return new Promise((resolve) => {
      const bin = this.bin();
      if (!bin) { resolve(); return; }
      // Under 'agent' scope this is what routes the mine into THAT agent's own
      // palace; null means the id could not be made into a safe path segment, and
      // mining into the fallback would silently pool it with everyone else's.
      if (!this.palacePath(id)) { resolve(); return; }
      ensureMineIgnore(agentDir); // keep settings.json / cursor / messages out of the index
      // stdin closed (mempalace can prompt); mempalace dedups so re-mining is safe.
      const proc = spawn(bin, ['mine', agentDir, '--wing', id, '--agent', id], {
        env: this.childEnv(id), stdio: ['ignore', 'ignore', 'pipe']
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

  /** Index ONE agent's memory.md into `memory_fts`.
   *
   *  Deliberately outside every `active()` gate above: this is the recall path
   *  for the machines that have no `mempalace`, so requiring the CLI to build it
   *  would defeat the reason it exists. Best-effort — a DB that will not take a
   *  write must not stop the mine loop for the agents queued behind this one. */
  private indexIntoFts(id: string, memPath: string): void {
    const store = this.store();
    if (!store || !id) return;
    let text = '';
    try { text = readFileSync(memPath, 'utf8'); } catch { return; }
    try { store.indexMemory(id, chunkMemory(text), this.getProject?.(id) ?? ''); }
    catch (e) { console.error(`[memory] could not index ${id} into memory_fts:`, e); }
  }

  // — recall (read) —

  /** Keyword recall out of the SQLite FTS5 index, narrowed by a real
   *  `WHERE agent_id = ?` (and optionally `project = ?`) predicate rather than by
   *  a `--wing` flag handed to a CLI.
   *
   *  Synchronous and dependency-free: it reads the PersistStore the app already
   *  has open. That makes it the ONLY recall path that works in the common case
   *  where `mempalace` is not on PATH — `active()` is false there and every
   *  mempalace call in this class degrades to a silent no-op.
   *
   *  LIMITATION, stated plainly because no doc may claim more (D-36): the scope
   *  this filters on is AGENT-SUPPLIED. Whoever calls names the wing, so this
   *  NARROWS recall, it does not ENFORCE isolation. RECALL-02 (Phase 5) is what
   *  makes the server bind the scope instead of trusting the asker. */
  keywordSearch(
    query: string,
    opts: { wing?: string; project?: string; results?: number } = {}
  ): { ok: boolean; output: string; error?: string } {
    const store = this.store();
    if (!store) return { ok: false, output: '', error: 'keyword recall needs the harness database, which is not open' };
    // Mirror palacePath()'s rule exactly, so the keyword path cannot become a way
    // around the scope the CLI path already applies: under 'shared' an unnamed
    // wing genuinely means everyone's notes (that IS the documented default), and
    // under 'agent' it means no palace — never everybody's.
    if (!opts.wing && this.scope() === 'agent') {
      return { ok: false, output: '', error: 'semantic memory is scoped per agent — name an agent to recall from' };
    }
    let hits;
    try {
      hits = store.searchMemory(query, { agentId: opts.wing, project: opts.project, limit: opts.results ?? 5 });
    } catch (e) {
      return { ok: false, output: '', error: e instanceof Error ? e.message : String(e) };
    }
    return { ok: true, output: hits.map((h) => h.text).join('\n\n---\n\n') };
  }

  /** Run one mempalace read command asynchronously. These used to be spawnSync
   *  with a 120s timeout — on a cold model load that BLOCKED the Electron main
   *  process (renderer IPC, timers, every window) for up to two minutes. Same
   *  contract, but the event loop keeps breathing and a wedged CLI is swept. */
  private runCli(args: string[], label: string, agentId?: string): Promise<{ ok: boolean; output: string; error?: string }> {
    return new Promise((resolve) => {
      const bin = this.bin();
      if (!this.active() || !bin) { resolve({ ok: false, output: '', error: 'semantic memory not active' }); return; }
      // Refuse rather than fall through to mempalace's own default path: under
      // 'agent' scope a read with no agent named has no palace to read.
      if (!this.palacePath(agentId)) {
        resolve({ ok: false, output: '', error: 'semantic memory is scoped per agent — name an agent to recall from' });
        return;
      }
      let proc: ReturnType<typeof spawn>;
      try {
        proc = spawn(bin, args, { env: this.childEnv(agentId), stdio: ['ignore', 'pipe', 'pipe'] });
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

  /** Semantic search. `wing` is an agent id: under the default 'shared' scope it
   *  narrows the one palace to that agent's wing, and under 'agent' scope it also
   *  selects which palace is opened at all. Returns the CLI's text output. */
  search(query: string, opts: { wing?: string; results?: number } = {}): Promise<{ ok: boolean; output: string; error?: string }> {
    // No mempalace, no palace, no meaning-based search — but the notes are still
    // sitting in memory_fts, so answer out of there rather than handing the user
    // "semantic memory not active" next to a panel full of their own text.
    if (!this.active()) return Promise.resolve(this.keywordSearch(query, opts));
    const args = ['search', query, '--results', String(opts.results ?? 5)];
    if (opts.wing) args.push('--wing', opts.wing);
    return this.runCli(args, 'search', opts.wing);
  }

  /** Session-start digest (~600-900 tokens). */
  wakeUp(wing?: string): Promise<{ ok: boolean; output: string; error?: string }> {
    const args = ['wake-up'];
    if (wing) args.push('--wing', wing);
    return this.runCli(args, 'wake-up', wing);
  }
}
