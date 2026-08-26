/**
 * PersistStore — durable harness state in SQLite (better-sqlite3, synchronous).
 *
 * Phase A scope (the rest of the renderer state stays in localStorage for now):
 *   - kv:               scalar app state. Today: the main window's bounds.
 *   - command_history:  NET-NEW — every prompt the user submits to an agent.
 *
 * Lives in the Electron MAIN process (better-sqlite3 is native + synchronous);
 * the renderer reaches it over IPC. The DB file sits next to config.json under
 * app.getPath('userData'). WAL mode so reads never block the single writer.
 *
 * Schema evolves via PRAGMA user_version migrations: an ordered array where
 * migration N runs when user_version < N+1, then bumps it. NEVER edit a shipped
 * migration — only append. Phases B/C (agents + message_queue mirror) and the
 * cross-lane cost_ledger are reserved as future additive migrations (see below);
 * they are deliberately NOT built in v1.
 */
import Database from 'better-sqlite3';
import { app } from 'electron';
import { existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';

/** One keyword-recall hit out of `memory_fts`. `project` is '' when the caller
 *  had no project to name — the column is stored either way so RECALL-02
 *  (Phase 5) can bind it server-side without another migration. */
export interface MemoryHit {
  text: string;
  agentId: string;
  project: string;
}

/** A captured user prompt, as returned to the renderer (camelCase columns). */
export interface CommandHistoryRow {
  id: number;
  agentId: string;
  cwd: string | null;
  text: string;
  ts: number;
}

/** One durable tool call (RECORD-01). `target` is the file path or command the
 *  agent named — AGENT-AUTHORED UNTRUSTED TEXT, so escape it at render and never
 *  hand it to a shell. It is `null` when the call genuinely had no target (a
 *  `Bash` with no path-shaped argument), which is a different fact from "the
 *  target was lost" and must stay distinguishable from it. */
export interface ToolCallRow {
  id: number;
  agentId: string;
  ts: number;
  tool: string;
  target: string | null;
  decision: string | null;
  reason: string | null;
}

/** One mirrored hive event (RECORD-02). `json` is the event verbatim, exactly as
 *  `hive.appendLog` wrote it to log.jsonl. */
export interface EventRow {
  id: number;
  ts: number;
  kind: string;
  json: string;
}

/** How long `events` are kept (D-18). 30 days, and the number is EXPORTED rather
 *  than buried in a caller so that changing it is a deliberate act: too short and
 *  a daily-digest or replay reader loses days it was promised, too long and the
 *  table is unbounded again. At a pessimistic ~288k rows/day, 30 days is still
 *  well inside what SQLite scans off an index without thinking. */
export const EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Byte cap on `tool_calls.target`. 4 KiB is longer than any real path and any
 *  command a human would type, and 4096× smaller than the 16 MiB a hook line may
 *  carry — which is what an agent could otherwise put in `tool_input.command`,
 *  once per tool call, forever. An uncapped column here is an unbounded write. */
const TARGET_MAX_BYTES = 4096;

/**
 * Ordered, append-only migrations. Index N takes the DB from user_version N to
 * N+1. To evolve the schema, APPEND a new function — never edit an existing one
 * (shipped DBs have already run it).
 *
 * FUTURE (do NOT build in v1 — reserved so the array isn't painted into a corner):
 *   - Phase B: `agents` + `message_queue` mirror of the renderer roster/queues
 *     (dual-write), enabling the eventual authority flip off localStorage.
 *   - Cross-lane (Lane A #6): migrate Jim's cost ledger onto this DB so his
 *     circuit-breaker can move off transcript-polling. Column names match his
 *     <harnessHome>/hive/cost-ledger.jsonl keys 1:1 for a straight INSERT…SELECT
 *     (coordinated w/ jim-mq290qkn 2026-06-06):
 *       cost_ledger(id, agent_id, session_id TEXT, ts, input, output,
 *                   cache_read, cache_creation, model TEXT, usd REAL)
 *     Rows are CUMULATIVE snapshots (one per agent per heartbeat beat) — diff
 *     consecutive rows for velocity; index (agent_id, session_id, ts). Additive;
 *     lands as a later migration.
 *     Why that contract is load-bearing, and how it has already been broken:
 *     docs/adr/0005-cumulative-cost-ledger.md.
 */
const MIGRATIONS: Array<(db: Database.Database) => void> = [
  // → user_version 1 (Phase A): scalar kv + net-new command history.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS kv (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,     -- JSON-encoded
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS command_history (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        cwd      TEXT,
        text     TEXT NOT NULL,
        ts       INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ch_agent_ts ON command_history(agent_id, ts DESC);
    `);
  },

  // → user_version 2 (FLOOR-07): FTS5 keyword recall.
  //
  // `IF NOT EXISTS` IS accepted on CREATE VIRTUAL TABLE by the SQLite that ships
  // inside better-sqlite3 13.0.3 (3.53.4) — verified 2026-08-21 by running both
  // forms twice against the binary that actually loads here, not by reading the
  // grammar. So the guard is KEPT rather than silently dropped; older grammars
  // reject it, and if this ever has to run against one, the fix is an explicit
  // sqlite_master probe, never a bare CREATE that fails the second time.
  //
  // agent_id and project are UNINDEXED on purpose: they are never MATCHed, only
  // compared in a `WHERE agent_id = ?` predicate (D-33). Indexing them would let
  // a search TERM match an id, which is precisely the cross-agent leak the
  // predicate exists to close.
  //
  // No `throw` in here. The quarantine path in open() is what makes a bad
  // migration survivable, and it only fires for corruption — a throw raised by a
  // migration escapes it and leaves the store permanently unopenable.
  (db) => {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
        text,
        agent_id UNINDEXED,
        project  UNINDEXED
      );
    `);
  },

  // → user_version 3 (RECORD-01 + RECORD-02): the durable record of what the
  // floor actually did.
  //
  // ONE migration for TWO tables, deliberately. The rail is append-only and
  // indexed by position, so two plans that each append "their" table produce two
  // MIGRATIONS[2]s: a merge conflict at best, and on any machine that already ran
  // one of them a user_version of 3 with only half the schema — which never
  // heals, because index 2 will never run again there. RECORD-01 and RECORD-02
  // land together or not at all.
  //
  // idx_tc_agent_ts is the same index shape command_history already carries
  // above: "who wrote this file" and "what did the floor run overnight" are that
  // one index read two ways. idx_tc_ts and idx_ev_ts exist so a DAY is a range
  // scan rather than a full table scan — tool_calls takes on the order of 288k
  // rows/day on a busy floor, and SCALE-03's replay reads it by date.
  //
  // `target` is AGENT-AUTHORED UNTRUSTED TEXT (ASVS V7): it is whatever string an
  // LLM put in tool_input.command / file_path. It is written with bound
  // parameters only, never interpolated into SQL, and it must be ESCAPED AT
  // RENDER — never eval'd, never fed to a shell, never trusted as a path. It is
  // nullable on purpose: a Bash call with no path-shaped argument has no target,
  // and "null by design" must stay distinguishable from "nothing was written".
  // `events.json` holds the whole event verbatim so nothing is lost to a schema
  // guess about a shape hive.ts is still free to change.
  //
  // Every statement takes IF NOT EXISTS, matching the discipline above. No
  // `throw` in here, for the reason migration 2 already gives: the quarantine
  // path in open() only fires for corruption, and a throw raised by a migration
  // escapes it and leaves the store permanently unopenable.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tool_calls (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT    NOT NULL,
        ts       INTEGER NOT NULL,        -- epoch ms, like command_history.ts
        tool     TEXT    NOT NULL,
        target   TEXT,                    -- file_path / path / notebook_path / command, capped
        decision TEXT,                    -- 'allow' | 'deny' | 'ask' — the gate's verdict
        reason   TEXT                     -- the operator-legible deny reason, when denied
      );
      CREATE INDEX IF NOT EXISTS idx_tc_agent_ts ON tool_calls(agent_id, ts DESC);
      CREATE INDEX IF NOT EXISTS idx_tc_ts       ON tool_calls(ts);
      CREATE TABLE IF NOT EXISTS events (
        id   INTEGER PRIMARY KEY AUTOINCREMENT,
        ts   INTEGER NOT NULL,
        kind TEXT    NOT NULL,            -- hive.ts's own \`kind\` field
        json TEXT    NOT NULL             -- the whole event, verbatim
      );
      CREATE INDEX IF NOT EXISTS idx_ev_ts      ON events(ts);
      CREATE INDEX IF NOT EXISTS idx_ev_kind_ts ON events(kind, ts);
    `);
  }
];

export class PersistStore {
  private db: Database.Database | null = null;

  /** The two HOT inserts, prepared once and reused. Everything else in this
   *  class prepares per call, which is fine at a handful of calls a minute;
   *  `tool_calls` and `events` take on the order of hundreds of thousands of
   *  rows a day between them. Nulled in close(), because a Statement is dead the
   *  moment its handle closes and a stale one reused after a reopen throws on
   *  every write. */
  private insToolCall: Database.Statement | null = null;
  private insEvent: Database.Statement | null = null;

  /**
   * @param dbPath   Override the DB location (tests). Wins over everything below.
   * @param getHome  The active `harnessHome`, read fresh on every open() —
   *   SCALE-01. An INJECTED closure (same shape as `hive.ts`'s), never a config
   *   read from inside this file: config.ts imports PersistStore FROM here, so
   *   importing it back would cycle — and this file must stay import-free of
   *   `./config` for that reason. Absent, or returning null (a fresh install
   *   before onboarding), keeps the historical userData path exactly.
   */
  constructor(private dbPath?: string, private getHome?: () => string | null) {}

  /** Open (creating if needed) and migrate the DB. Idempotent — a second call is
   *  a no-op. A corrupt file is quarantined and re-created once (see below);
   *  anything else — the native module failing to load, an unwritable dir —
   *  throws, and callers guard so a DB failure can't crash app startup. */
  open(): void {
    if (this.db) return;
    const path = this.dbPath ?? join(this.getHome?.() ?? app.getPath('userData'), 'harness.db');
    try {
      this.db = this.openOnce(path);
    } catch (e) {
      // A file that isn't a database can never heal itself, and every kv/history
      // call guards on `this.db` — so without this the app would look perfectly
      // healthy while silently persisting NOTHING, for the life of the install.
      // Move the bad file aside (never delete: it's still the only copy of the
      // user's history, and `sqlite3 .recover` can often read it) and open a
      // fresh one. Exactly one retry — a second failure is not corruption.
      if (!isCorruptDb(e)) throw e;
      console.error(`[db] ${path} is not a usable database — quarantining and starting fresh:`, e);
      quarantine(path);
      this.db = this.openOnce(path);
    }
  }

  private openOnce(path: string): Database.Database {
    const db = new Database(path);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('foreign_keys = ON');
    this.migrate(db);
    return db;
  }

  private migrate(db: Database.Database): void {
    const version = db.pragma('user_version', { simple: true }) as number;
    for (let i = version; i < MIGRATIONS.length; i++) {
      // Each migration + its version bump run in one transaction so a crash
      // mid-migration never leaves a half-applied schema at the wrong version.
      const run = db.transaction(() => {
        MIGRATIONS[i](db);
        db.pragma(`user_version = ${i + 1}`);
      });
      run();
    }
  }

  /** Close the handle (checkpoints WAL). Safe to call when already closed. */
  close(): void {
    // Drop the cached statements BEFORE the handle: they belong to it, and a
    // reopen on the same instance must prepare fresh ones.
    this.insToolCall = null;
    this.insEvent = null;
    try { this.db?.close(); } catch { /* best-effort on shutdown */ }
    this.db = null;
  }

  /**
   * Reopen at whatever the default path resolves to NOW (SCALE-01).
   *
   * Onboarding sets `harnessHome` through `config:update`, which is the one
   * transition that does NOT relaunch — so without this the module-level handle
   * stays bound to the pre-onboarding file for the rest of the session and every
   * kv write (including `missionLastFiredAt`) lands in the wrong project's DB.
   *
   * `dbPath` is deliberately left alone: the default branch is re-evaluated
   * inside open(), so close-then-reopen is the whole job, and a genuine test
   * override must keep pointing where the test put it.
   */
  repoint(): void {
    this.close();
    this.open();
  }

  get isOpen(): boolean { return this.db !== null; }

  // ─── kv (scalar app state) ─────────────────────────────────────────────────

  /** Read a JSON-decoded scalar, or undefined if absent/unparseable. */
  getKv<T = unknown>(key: string): T | undefined {
    if (!this.db) return undefined;
    const row = this.db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
    if (!row) return undefined;
    try { return JSON.parse(row.value) as T; } catch { return undefined; }
  }

  /** Upsert a JSON-encoded scalar. */
  setKv(key: string, value: unknown): void {
    if (!this.db) return;
    this.db.prepare(
      `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(key, JSON.stringify(value), Date.now());
  }

  // ─── command history (net-new) ─────────────────────────────────────────────

  /** Record one submitted prompt. Empty text or missing agent id are ignored. */
  addHistory(entry: { agentId: string; cwd?: string | null; text: string }): void {
    if (!this.db) return;
    const text = (entry.text ?? '').trim();
    if (!text || !entry.agentId) return;
    this.db.prepare('INSERT INTO command_history (agent_id, cwd, text, ts) VALUES (?, ?, ?, ?)')
      .run(entry.agentId, entry.cwd ?? null, text, Date.now());
  }

  /** Most-recent-first history, optionally scoped to one agent. */
  listHistory(agentId?: string, limit = 100): CommandHistoryRow[] {
    if (!this.db) return [];
    const lim = clampLimit(limit, 100);
    const rows = agentId
      ? this.db.prepare(
          'SELECT id, agent_id AS agentId, cwd, text, ts FROM command_history WHERE agent_id = ? ORDER BY ts DESC, id DESC LIMIT ?'
        ).all(agentId, lim)
      : this.db.prepare(
          'SELECT id, agent_id AS agentId, cwd, text, ts FROM command_history ORDER BY ts DESC, id DESC LIMIT ?'
        ).all(lim);
    return rows as CommandHistoryRow[];
  }

  /** Substring search over prompt text, most-recent-first. */
  searchHistory(query: string, limit = 50): CommandHistoryRow[] {
    if (!this.db) return [];
    const q = (query ?? '').trim();
    if (!q) return [];
    const lim = clampLimit(limit, 50);
    // Escape LIKE wildcards so a literal % or _ in the query isn't a metachar.
    const needle = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    return this.db.prepare(
      "SELECT id, agent_id AS agentId, cwd, text, ts FROM command_history WHERE text LIKE ? ESCAPE '\\' ORDER BY ts DESC, id DESC LIMIT ?"
    ).all(needle, lim) as CommandHistoryRow[];
  }

  // ─── tool_calls (RECORD-01: what the floor actually ran) ───────────────────

  /** Record one tool call.
   *
   *  Best-effort by design: a closed store, a missing agent id or a missing tool
   *  name is DROPPED rather than thrown. The caller is a hook handler on the
   *  request path, and a database problem must never be able to deny a tool call
   *  — the record exists to observe the floor, not to gate it.
   *
   *  Durability, at the level SQLite actually gives it: `synchronous = NORMAL`
   *  under WAL (openOnce, above) means this row is a committed WAL append before
   *  the call returns, so it survives a PROCESS crash — which is the crash this
   *  requirement is about. It is NOT guaranteed against an OS or power loss
   *  until the next checkpoint. That is the right trade here and it is written
   *  down rather than silently upgraded: `FULL` would fsync on every single tool
   *  call, hundreds of thousands of times a day, to buy a guarantee against a
   *  failure mode that also takes the work being recorded.
   *
   *  ponytail: one cached prepared statement, no batching queue. An unbatched
   *  prepared insert under WAL is single-digit microseconds at this volume, and
   *  a queue is a buffer that is EMPTY after the crash this record exists for.
   *  If a measurement ever shows write contention, the upgrade path is
   *  `db.transaction()` over a ~100 ms flush window — and its cost is exactly
   *  the durability described above. */
  recordToolCall(row: {
    agentId: string;
    ts: number;
    tool: string;
    target?: string | null;
    decision?: string | null;
    reason?: string | null;
  }): void {
    if (!this.db || !row.agentId || !row.tool) return;
    this.insToolCall ??= this.db.prepare(
      'INSERT INTO tool_calls (agent_id, ts, tool, target, decision, reason) VALUES (?, ?, ?, ?, ?, ?)'
    );
    this.insToolCall.run(
      row.agentId,
      Number.isFinite(row.ts) ? Math.floor(row.ts) : Date.now(),
      row.tool,
      row.target == null ? null : capBytes(String(row.target), TARGET_MAX_BYTES),
      row.decision ?? null,
      row.reason ?? null
    );
  }

  /** Most-recent-first tool calls, optionally scoped to one agent and to an
   *  inclusive lower time bound. The limit is CLAMPED and never trusted: the
   *  caller is ultimately an agent reaching over IPC, and one unclamped query
   *  against a table that takes ~288k rows a day pulls the lot into the main
   *  process. Every value is a bound parameter; nothing is interpolated. */
  toolCalls(q: { agentId?: string; sinceMs?: number; limit?: number } = {}): ToolCallRow[] {
    if (!this.db) return [];
    const lim = clampLimit(q.limit ?? 100, 100);
    // `ts >= 0` when no bound is given, rather than a third and fourth SQL
    // shape: epoch ms is never negative, so the predicate is a no-op that keeps
    // this to the same two branches listHistory already uses — and both of them
    // still read straight off idx_tc_agent_ts.
    const since = Number.isFinite(q.sinceMs) ? Math.floor(q.sinceMs as number) : 0;
    const rows = q.agentId
      ? this.db.prepare(
          'SELECT id, agent_id AS agentId, ts, tool, target, decision, reason FROM tool_calls'
          + ' WHERE agent_id = ? AND ts >= ? ORDER BY ts DESC, id DESC LIMIT ?'
        ).all(q.agentId, since, lim)
      : this.db.prepare(
          'SELECT id, agent_id AS agentId, ts, tool, target, decision, reason FROM tool_calls'
          + ' WHERE ts >= ? ORDER BY ts DESC, id DESC LIMIT ?'
        ).all(since, lim);
    return rows as ToolCallRow[];
  }

  // ─── events (RECORD-02: a day that already happened is still readable) ─────

  /** Mirror one hive event. Best-effort in the same sense as recordToolCall, and
   *  for a sharper reason: this runs BESIDE hive.appendLog's appendFileSync,
   *  which stays the crash-safe path and stays what logTail reads. A failure
   *  here costs the mirror and never the JSONL.
   *
   *  `json` is stored uncapped and verbatim. That is deliberate — the whole
   *  point of the column is that nothing is lost to a schema guess — and it is
   *  why pruneEvents, not a length cap, is what keeps this table finite. */
  appendEvent(kind: string, json: string, ts?: number): void {
    if (!this.db || !kind || !json) return;
    this.insEvent ??= this.db.prepare('INSERT INTO events (ts, kind, json) VALUES (?, ?, ?)');
    this.insEvent.run(Number.isFinite(ts) ? Math.floor(ts as number) : Date.now(), kind, json);
  }

  /** Every event in [fromMs, toMs) in ascending ts — a DAY, read as one range
   *  scan off idx_ev_ts. The lower bound is inclusive and the upper exclusive so
   *  two adjacent days never both claim the midnight event.
   *
   *  Deliberately unlimited, unlike toolCalls. This is the replay path, and "the
   *  day, minus whatever fell past a LIMIT" is precisely the one-generation
   *  8 MiB rotate this requirement exists to replace: it would return a
   *  plausible-looking count and quietly drop the morning. The bound that keeps
   *  the table finite is pruneEvents. */
  eventsBetween(fromMs: number, toMs: number): EventRow[] {
    if (!this.db) return [];
    const from = Number.isFinite(fromMs) ? Math.floor(fromMs) : 0;
    const to = Number.isFinite(toMs) ? Math.floor(toMs) : 0;
    return this.db.prepare(
      'SELECT id, ts, kind, json FROM events WHERE ts >= ? AND ts < ? ORDER BY ts ASC, id ASC'
    ).all(from, to) as EventRow[];
  }

  /** Delete events STRICTLY older than the bound; returns how many went.
   *
   *  Strictly older, so a caller that passes the start of the oldest day it
   *  wants to keep keeps that whole day. `<=` here would silently eat the
   *  retention window's own edge every time it ran. A non-finite bound deletes
   *  nothing rather than everything. See EVENT_RETENTION_MS for the shipped
   *  window; the schedule that calls this lives with the caller, not here. */
  pruneEvents(olderThanMs: number): number {
    if (!this.db || !Number.isFinite(olderThanMs)) return 0;
    return this.db.prepare('DELETE FROM events WHERE ts < ?').run(Math.floor(olderThanMs)).changes;
  }

  /** The earliest event timestamp STILL STORED, or null when nothing is.
   *
   *  SCALE-03 reports this to the renderer as `firstTs`, and the distinction in
   *  that first sentence is the whole point: pruneEvents above moves MIN(ts)
   *  forward every day, so this is NOT "the first event ever". A day-band that
   *  draws "no record before 09:14" is making a claim about what this store can
   *  answer RIGHT NOW; sourcing that claim from anything older would promise
   *  coverage the retention window already deleted.
   *
   *  null, never 0, on an empty table — 0 is a real epoch timestamp and a UI
   *  cannot tell a sentinel apart from a claim that records began in 1970.
   *  MIN(ts) reads straight off idx_ev_ts, so this is an index seek and not the
   *  full-table scan the row count would otherwise imply. */
  earliestEventTs(): number | null {
    if (!this.db) return null;
    const row = this.db.prepare('SELECT MIN(ts) AS ts FROM events').get() as { ts: number | null } | undefined;
    return row?.ts ?? null;
  }

  // ─── memory_fts (FLOOR-07 keyword recall) ──────────────────────────────────

  /** Re-index ONE agent's memory as `chunks`, replacing everything previously
   *  stored for that agent.
   *
   *  Replace, not append: `memory.md` is rewritten wholesale by the reflector's
   *  condense, so appending would leave every superseded decision in the index
   *  and recall would keep surfacing text that no longer exists in the memory it
   *  came from. Scoped by agent_id ALONE — not (agent_id, project) — because an
   *  agent whose project changed would otherwise keep a full stale copy of its
   *  notes filed under the old one, reachable by anyone who names it. */
  indexMemory(agentId: string, chunks: string[], project = ''): void {
    if (!this.db || !agentId) return;
    const del = this.db.prepare('DELETE FROM memory_fts WHERE agent_id = ?');
    const ins = this.db.prepare('INSERT INTO memory_fts (text, agent_id, project) VALUES (?, ?, ?)');
    this.db.transaction(() => {
      del.run(agentId);
      for (const c of chunks) if (c) ins.run(c, agentId, project);
    })();
  }

  /** Keyword recall over `memory_fts`, narrowed by a real WHERE predicate.
   *
   *  Every value is a BOUND parameter — the MATCH term, the agent id, the
   *  project and the limit. Nothing is concatenated into the SQL (T-P10-03).
   *
   *  Omitting `agentId` really does search every agent, and that is the
   *  documented 'shared' default (see the sharing model at memory.ts:10-21), not
   *  an oversight. What this does NOT do is enforce the scope: the id is
   *  supplied by whoever asks. RECALL-02 (Phase 5) is what makes the server bind
   *  it instead of trusting the agent's own `--wing`. */
  searchMemory(
    query: string,
    opts: { agentId?: string; project?: string; limit?: number } = {}
  ): MemoryHit[] {
    if (!this.db) return [];
    const match = ftsMatchTerms(query);
    if (!match) return [];
    const where = ['memory_fts MATCH ?'];
    const params: unknown[] = [match];
    if (opts.agentId) { where.push('agent_id = ?'); params.push(opts.agentId); }
    if (opts.project) { where.push('project = ?'); params.push(opts.project); }
    params.push(clampLimit(opts.limit ?? 5, 5));
    return this.db.prepare(
      `SELECT text, agent_id AS agentId, project FROM memory_fts
        WHERE ${where.join(' AND ')} ORDER BY rank LIMIT ?`
    ).all(...params) as MemoryHit[];
  }
}

/** Is this the "that file is not a SQLite database" family of failures — a
 *  truncated write, a half-synced cloud copy, a page-level corruption — as
 *  opposed to a missing native module or an unwritable directory? Only the
 *  former is fixable by starting over. */
function isCorruptDb(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && /^SQLITE_(NOTADB|CORRUPT)/.test(code)) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /not a database|database disk image is malformed|file is encrypted/i.test(msg);
}

/** Rename `harness.db` (and its WAL siblings — a stale -wal against a new DB is
 *  its own corruption) to `harness.db.corrupt-<ts>`. Throws if the rename fails,
 *  because retrying the open on a file we couldn't move would just fail again. */
function quarantine(path: string): void {
  const stamp = Date.now();
  for (const suffix of ['', '-wal', '-shm']) {
    const from = `${path}${suffix}`;
    if (existsSync(from)) renameSync(from, `${path}.corrupt-${stamp}${suffix}`);
  }
}

/** Reduce a user/agent query to a plain FTS5 phrase search.
 *
 *  MATCH takes a query LANGUAGE, not a literal: `AND`, `OR`, `NOT`, `NEAR`, `*`,
 *  `^`, `-`, `:` and an unbalanced `"` are all operators or syntax errors there.
 *  A bound parameter binds the STRING and not its MEANING, so binding alone does
 *  NOT stop a search box from steering the query or throwing (T-P10-03). Keeping
 *  only word characters and re-quoting each term makes every possible input a
 *  literal phrase search that cannot be either.
 *
 *  Returns null when nothing survives, so the caller answers "no hits" rather
 *  than running `MATCH ''`, which is itself a syntax error. */
function ftsMatchTerms(query: string): string | null {
  const terms = String(query ?? '').match(/[\p{L}\p{N}_]+/gu);
  if (!terms || terms.length === 0) return null;
  return terms.slice(0, 32).map((t) => `"${t}"`).join(' ');
}

/** Truncate a string to a UTF-8 BYTE cap.
 *
 *  Bytes, not characters, because the cap exists to bound what reaches the disk
 *  and one emoji is four of them. A multi-byte sequence split by the cut decodes
 *  to U+FFFD rather than throwing — losing the tail of an already-over-long
 *  agent-authored string is the correct trade against an unbounded column, and
 *  the value is still a plain string on the way back out. */
function capBytes(s: string, max: number): string {
  const buf = Buffer.from(s, 'utf8');
  return buf.byteLength <= max ? s : buf.subarray(0, max).toString('utf8');
}

/** Coerce an untrusted limit into [1, 1000] with a sane fallback. */
function clampLimit(n: number, fallback: number): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return Math.min(1000, v);
}
