/**
 * RECORD-05 — restore points over the OPERATOR's project repo.
 *
 * The requirement is "put one file back to how it was at 02:00 without losing
 * the other three agents' work", with a hard constraint: the operator's own
 * **index, working tree, branches, `git status` and `git log`** must be
 * untouched. D-20 scored four candidates against exactly that list and only one
 * passed all five — a **separate `GIT_DIR` over the operator's work-tree**:
 *
 *     git --git-dir=<store> --work-tree=<operator repo> add -A
 *
 * Everything git needs lives in `<store>`: its own objects, its own refs, and
 * (Pitfall 7, measured) its own index at `<store>/index`, reached with no index
 * env var of any kind. That is why nothing here sets one, and why `git.ts`'s
 * `runGit` — which takes no `env` parameter — needed no change. The absence is
 * asserted by test/restore-points.test.cjs, which greps this file for that
 * variable's name; adding one back, even in a comment, is red.
 *
 * Three measured facts shape the code below:
 *
 * **L-06 — one `git init` in a subdirectory kills the entire restore point.**
 * An uncommitted embedded repo makes `add -A` print `does not have a commit
 * checked out` and **exit 128**, adding nothing. An embedded repo *with* commits
 * is worse and quieter: it is recorded as a gitlink (mode `160000`), so the
 * snapshot claims a subtree whose objects it does not have. This is not
 * hypothetical — agents create git worktrees inside the operator's repo
 * (`git.ts`'s `listWorktrees`). The mitigation is `refreshNestedExcludes()`
 * below: discover nested `.git` entries and write them into
 * `<store>/info/exclude`, which lives in the SHADOW store and touches nothing of
 * the operator's.
 *
 * **L-07 — `<store>/index.lock` contention is fatal and git does not retry it.**
 * Two concurrent `add -A` produce `fatal: Unable to create '…/index.lock'`. So
 * this class carries `gitCommitter`'s single-writer discipline: a `snapshotting`
 * set, a trailing debounce, and `STALE_LOCK_MS` recovery for a lock left behind
 * by a crashed git. That discipline is **copied, not imported** — ADR-0004's
 * one-committer rule is about the HIVE repo, and this is a different repo with a
 * different lock, so sharing the instance would serialize two unrelated things.
 * The duplication is deliberate.
 *
 * **The operator's `.gitignore` is honoured for free.** `add -A` under the
 * shadow store reads `<repo>/.gitignore`, so a gitignored `build/` produced 0
 * entries when measured. Note that this and `UNTRACK_PATHS` are two DIFFERENT
 * mechanisms solving two different problems: `.gitignore` keeps fat paths out of
 * a snapshot, while `UNTRACK_PATHS` + the hive's ignore seed keep the STORE out
 * of the hive repo.
 *
 * Electron-free on purpose: all three CI runners install with
 * `npm ci --ignore-scripts` and have no electron binary, so a module that
 * imports `electron` is a module whose tests silently do not exist.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { safeJoin } from './fs';

/** How often the floor takes a restore point. `[ASSUMED]` — nothing measured how
 *  often an operator's overnight run actually needs a rollback point; 15 minutes
 *  is a starting value chosen to keep "put it back to 02:00" within a quarter of
 *  an hour while costing one `add -A` per window. A plain constant, one edit from
 *  changing, and pinned by a test so the change is deliberate. */
export const SNAPSHOT_CADENCE_MS = 15 * 60_000;

/** How long restore points are kept. `[ASSUMED]` — 48 hours covers the overnight
 *  case the requirement names with a full day of margin, and bounds the store.
 *  Same status as the cadence above: stated, not measured. */
export const SNAPSHOT_RETENTION_MS = 48 * 60 * 60_000;

/** Trailing debounce on scheduled snapshots, so a burst of floor activity folds
 *  into one `add -A` instead of queueing several against the same index. Same
 *  shape and reasoning as gitCommitter's commit debounce. */
const SNAPSHOT_DEBOUNCE_MS = 5_000;

/** Per-git-invocation timeout. Generous: `add -A` over a large repo behind
 *  Windows antivirus is slow but alive, and killing it is how you get a stale
 *  lock in the first place. Must stay well BELOW STALE_LOCK_MS. */
const GIT_TIMEOUT_MS = 60_000;

/** How old `<store>/index.lock` must be before it is treated as abandoned.
 *  Copied from gitCommitter (`STALE_LOCK_MS`), including its rule: comfortably
 *  ABOVE our own git timeout, or a slow-but-alive git has its LIVE lock deleted
 *  out from under it. */
const STALE_LOCK_MS = 5 * 60_000;

/** The five `-c` overrides that were measured working on win32. None is
 *  optional: `core.autocrlf=false` is what keeps a snapshot byte-identical in
 *  both directions (without it git warns "LF will be replaced by CRLF" and
 *  rewrites the content), `core.longpaths=true` is what keeps a deep node_modules
 *  path from failing the add, and the identity pair is what keeps the snapshot
 *  from depending on whether the operator has a global git identity configured. */
const GIT_CFG = [
  '-c', 'core.autocrlf=false',
  '-c', 'core.safecrlf=false',
  '-c', 'core.longpaths=true',
  '-c', 'user.email=hive@local',
  '-c', 'user.name=hive',
  '-c', 'commit.gpgsign=false'
];

/** Bounds on the nested-`.git` walk, so the guard costs a shallow scan and never
 *  a full tree traversal of a large repo. A nested repo deeper than this, or past
 *  the entry budget, is not excluded — which degrades to L-06's LOUD failure
 *  (exit 128, logged) rather than to a silent hollow gitlink. */
const NESTED_SCAN_MAX_DEPTH = 6;
const NESTED_SCAN_MAX_DIRS = 4_000;
/** Directories never worth descending for a nested `.git`: huge, and a package
 *  manager's own vendored repos are not the operator's work. */
const NESTED_SCAN_SKIP = new Set(['node_modules', '.git', 'dist', 'out', 'build', '.cache']);

/** One restore point. `ts` comes out of the ref NAME, not the commit, so listing
 *  and pruning never have to read an object. */
export interface RestorePoint {
  ref: string;
  sha: string;
  ts: number;
}

export interface RestorePointsDeps {
  /** Where the per-repo stores live: `<harnessHome>/hive/restore`. A thunk, in
   *  the same shape as HiveManager's `getHome`, so the store follows a config
   *  change instead of being frozen at construction. null before onboarding. */
  storeRoot: () => string | null;
  /** The hive's durable log (HiveManager.appendLog). Injected, not imported —
   *  this module is electron-free and must stay loadable without the floor. */
  log?: (event: Record<string, unknown>) => void;
}

/** A ref name is chronological AND lexicographic: `refs/restore/<iso>` with the
 *  colons swapped for dashes, so `for-each-ref` sorted by refname is sorted by
 *  time and the ts parses straight back out of the name. */
const REF_PREFIX = 'refs/restore/';
const refNameFor = (ts: number): string =>
  REF_PREFIX + new Date(ts).toISOString().replace(/[:.]/g, '-');
const tsFromRef = (ref: string): number => {
  const stamp = ref.slice(REF_PREFIX.length);
  // 2026-08-25T04-05-06-789Z → 2026-08-25T04:05:06.789Z
  const iso = stamp.replace(
    /^(\d{4}-\d{2}-\d{2}T)(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,
    '$1$2:$3:$4.$5Z'
  );
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
};

export class RestorePoints {
  constructor(private readonly deps: RestorePointsDeps) {}

  /** Set per store while a git child WE spawned is alive, so clearStaleLock can
   *  never delete an index.lock belonging to one of ours. */
  private readonly inFlight = new Set<string>();
  /** Set per store for the whole snapshot, so two snapshots can never interleave
   *  `add -A` against the same index (L-07). */
  private readonly snapshotting = new Set<string>();
  /** Trailing debounce timers, one per repo. */
  private readonly timers = new Map<string, NodeJS.Timeout>();

  // ── the store ─────────────────────────────────────────────────────────────

  /**
   * The top level of the repo `cwd` sits in, or null when it is not in one.
   *
   * Callers hold an AGENT's cwd, which is very often a subdirectory. Snapshotting
   * that subdirectory directly would be quietly wrong in the expensive direction:
   * with `--work-tree=<subdir>` git treats the subdirectory as the top level and
   * never reads the repo root's `.gitignore`, so the "a gitignored `build/`
   * contributes 0 entries" property (T-04-SNAP-05) silently stops holding and
   * the store fills with node_modules. Resolving to the top level first is what
   * keeps that mitigation true.
   *
   * `rev-parse` is read-only — it does not touch the operator's index — and it
   * resolves to the WORKTREE root for an agent working in a git worktree, which
   * is the right answer: that is the tree whose files need restoring.
   */
  async repoRootOf(cwd: string): Promise<string | null> {
    if (!cwd || !existsSync(cwd)) return null;
    const r = await this.git('', ['-C', cwd, 'rev-parse', '--show-toplevel']);
    const out = r.out.trim();
    return r.ok && out ? out : null;
  }

  /**
   * Where this repo's shadow store lives.
   *
   * One store PER REPO, keyed by a hash of the repo's real path: `RegistryAgent.cwd`
   * is per agent, so one floor can plausibly have agents in several project
   * repos, and a single floor-wide store would snapshot whichever repo happened
   * to be first and silently ignore the rest.
   *
   * The key hashes `realpathSync.native`, **never** `realpathSync`: on win32 the
   * plain version does not canonicalize drive-letter or path-segment case, so
   * `E:\repo` and `e:\repo` would key two stores, each holding a partial history
   * and neither knowing about the other (T-04-SNAP-09). `.native` does
   * canonicalize, so both spellings land in one store.
   */
  storePathFor(repoRoot: string): string | null {
    const root = this.deps.storeRoot();
    if (!root || !repoRoot) return null;
    let real: string;
    try { real = realpathSync.native(repoRoot); } catch { return null; }
    const key = createHash('sha256').update(real).digest('hex').slice(0, 16);
    return join(root, `${key}.git`);
  }

  /** Create the bare store if absent and refresh its nested-repo excludes.
   *  Returns the store path, or null when there is nowhere to put one. */
  async ensureStore(repoRoot: string): Promise<string | null> {
    const store = this.storePathFor(repoRoot);
    if (!store) return null;
    if (!existsSync(join(store, 'HEAD'))) {
      mkdirSync(store, { recursive: true });
      const init = await this.git(store, ['init', '-q', '--bare', store]);
      if (!init.ok) { this.warn('store init failed', repoRoot, init.err); return null; }
      // Which repo is this store for? Written where `git` itself keeps a store's
      // human label, so an operator staring at a directory of hashes can tell.
      try {
        writeFileSync(join(store, 'description'), `${realpathSync.native(repoRoot)}\n`, 'utf8');
      } catch { /* a store without a label still works */ }
    }
    this.refreshNestedExcludes(store, repoRoot);
    return store;
  }

  /**
   * L-06's guard. Regenerated on EVERY snapshot rather than written once: an
   * agent worktree that has been removed must stop being excluded, or the
   * operator's real files under that path stay invisible to every later restore
   * point.
   */
  private refreshNestedExcludes(store: string, repoRoot: string): void {
    const nested = this.findNestedGitDirs(repoRoot);
    try {
      mkdirSync(join(store, 'info'), { recursive: true });
      const body = [
        '# Regenerated by RestorePoints on every snapshot (L-06).',
        '# Nested repos make `add -A` exit 128, or record a hollow 160000 gitlink.',
        ...nested.map((rel) => `/${rel.split(sep).join('/')}/`)
      ].join('\n') + '\n';
      writeFileSync(join(store, 'info', 'exclude'), body, 'utf8');
    } catch (e) {
      this.warn('could not refresh the nested-repo excludes', repoRoot, String(e));
    }
  }

  /** Directories under `repoRoot` (depth ≥ 1) that contain a `.git`. A bounded
   *  breadth-first walk — see NESTED_SCAN_MAX_DEPTH / _MAX_DIRS. Node's own
   *  readdir, not a shelled `find`, which does not exist on win32. */
  private findNestedGitDirs(repoRoot: string): string[] {
    const found: string[] = [];
    let budget = NESTED_SCAN_MAX_DIRS;
    const queue: Array<{ abs: string; rel: string; depth: number }> = [
      { abs: repoRoot, rel: '', depth: 0 }
    ];
    while (queue.length && budget > 0) {
      const cur = queue.shift()!;
      budget--;
      let entries: import('node:fs').Dirent[];
      try { entries = readdirSync(cur.abs, { withFileTypes: true }); } catch { continue; }
      for (const ent of entries) {
        if (!ent.isDirectory() && !ent.isSymbolicLink()) continue;
        if (NESTED_SCAN_SKIP.has(ent.name)) continue;
        const rel = cur.rel ? join(cur.rel, ent.name) : ent.name;
        // A nested repo is a directory holding a `.git` (a real repo) or a
        // `.git` FILE (a worktree, which is what agents actually create).
        if (existsSync(join(cur.abs, ent.name, '.git'))) { found.push(rel); continue; }
        if (cur.depth + 1 < NESTED_SCAN_MAX_DEPTH) {
          queue.push({ abs: join(cur.abs, ent.name), rel, depth: cur.depth + 1 });
        }
      }
    }
    return found;
  }

  // ── snapshot ──────────────────────────────────────────────────────────────

  /**
   * Take one restore point of `repoRoot`. Returns the commit sha, or null when
   * nothing changed since the last point (an empty restore point is noise: an
   * idle floor would fill the store with them and push the real ones out of the
   * retention window) or when the snapshot could not be taken.
   *
   * Each point is a **root commit** carrying its own ref, not a link in a chain.
   * That is what makes pruning honest: dropping an old point is `update-ref -d`
   * plus a `gc`, with no history rewrite and no risk of orphaning the NEWER
   * points — which is exactly what "move the branch ref back" would have done.
   * Dedup is unaffected: git is content-addressed, so two points sharing a file
   * share its blob whether or not they share a parent.
   */
  async snapshot(repoRoot: string): Promise<string | null> {
    const store = await this.ensureStore(repoRoot);
    if (!store) return null;
    // L-07: fold this call into the running one rather than run a second
    // `add -A` against the same index. git treats the lock as fatal, not
    // retryable, so the only safe answer is not to race at all.
    if (this.snapshotting.has(store)) return null;
    this.snapshotting.add(store);
    try {
      this.clearStaleLock(store);
      const add = await this.git(store, [...this.base(store, repoRoot), 'add', '-A']);
      if (!add.ok) { this.warn('snapshot add failed', repoRoot, add.err); return null; }

      const tree = await this.git(store, [...this.base(store, repoRoot), 'write-tree']);
      if (!tree.ok) { this.warn('snapshot write-tree failed', repoRoot, tree.err); return null; }
      const treeSha = tree.out.trim();

      const points = await this.listPoints(repoRoot);
      if (points.length) {
        const last = await this.git(store, [...this.base(store, repoRoot), 'rev-parse', `${points[points.length - 1].sha}^{tree}`]);
        if (last.ok && last.out.trim() === treeSha) return null; // nothing changed
      }

      const ts = Date.now();
      const commit = await this.git(store, [
        ...this.base(store, repoRoot),
        'commit-tree', treeSha, '-m', `restore-point ${new Date(ts).toISOString()}`
      ]);
      if (!commit.ok) { this.warn('snapshot commit-tree failed', repoRoot, commit.err); return null; }
      const sha = commit.out.trim();

      const ref = await this.git(store, [...this.base(store, repoRoot), 'update-ref', refNameFor(ts), sha]);
      if (!ref.ok) { this.warn('snapshot update-ref failed', repoRoot, ref.err); return null; }
      return sha;
    } finally {
      this.snapshotting.delete(store);
    }
  }

  /** Take a snapshot after a trailing debounce, folding a burst of activity into
   *  one. Fire-and-forget: nothing is lost if the app quits with one pending —
   *  the next window picks the same working tree up. */
  schedule(repoRoot: string): void {
    if (this.timers.has(repoRoot)) return;
    const t = setTimeout(() => {
      this.timers.delete(repoRoot);
      void this.snapshot(repoRoot).catch(() => { /* logged inside */ });
    }, SNAPSHOT_DEBOUNCE_MS);
    // A pending snapshot must never be the reason the process stays alive.
    t.unref?.();
    this.timers.set(repoRoot, t);
  }

  /** Cancel every pending debounce. Called from the floor's ONE shutdown list. */
  stop(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  // ── read ──────────────────────────────────────────────────────────────────

  /** Every restore point for this repo, oldest first. Reads ref NAMES only. */
  async listPoints(repoRoot: string): Promise<RestorePoint[]> {
    const store = this.storePathFor(repoRoot);
    if (!store || !existsSync(join(store, 'HEAD'))) return [];
    const r = await this.git(store, [
      '--git-dir', store, ...GIT_CFG,
      'for-each-ref', '--sort=refname', '--format=%(refname) %(objectname)', REF_PREFIX
    ]);
    if (!r.ok) return [];
    return r.out.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
      const [ref, sha] = line.split(' ');
      return { ref, sha, ts: tsFromRef(ref) };
    });
  }

  /** The paths a restore point contains. `withMode` returns raw `ls-tree` lines
   *  (`<mode> <type> <sha>\t<path>`) so a caller can tell a gitlink (mode
   *  160000, L-06's quiet half) from a real file. */
  async listFiles(repoRoot: string, sha: string, withMode = false): Promise<string[]> {
    const store = this.storePathFor(repoRoot);
    if (!store || !/^[0-9a-f]{7,40}$/.test(sha)) return [];
    const r = await this.git(store, [
      '--git-dir', store, ...GIT_CFG,
      'ls-tree', '-r', ...(withMode ? [] : ['--name-only']), sha
    ]);
    return r.ok ? r.out.split('\n').map((l) => l.trim()).filter(Boolean) : [];
  }

  // ── restore ───────────────────────────────────────────────────────────────

  /**
   * Put ONE file back to its state in `sha`. Per file, never per tree: the whole
   * requirement is that the other agents' changed files are left alone, so there
   * is deliberately no "restore everything" here for a caller to reach for by
   * mistake.
   *
   * `relPath` is operator input reaching a git argument (ASVS V12), so it goes
   * through `safeJoin` — the app's ONE path-escape policy — before anything
   * spawns. A `../` that lands outside the repo is refused, not clamped.
   */
  async restoreFile(repoRoot: string, sha: string, relPath: string): Promise<boolean> {
    const store = this.storePathFor(repoRoot);
    if (!store || !relPath || !/^[0-9a-f]{7,40}$/.test(sha)) return false;
    if (!safeJoin(repoRoot, relPath)) {
      this.warn('refused a restore path that escapes the repo root', repoRoot, relPath);
      return false;
    }
    const r = await this.git(store, [
      ...this.base(store, repoRoot), 'checkout', sha, '--', relPath
    ]);
    if (!r.ok) this.warn('restore failed', repoRoot, r.err);
    return r.ok;
  }

  // ── prune ─────────────────────────────────────────────────────────────────

  /**
   * Drop restore points older than `keepMs`, then `gc` the store. Returns how
   * many went.
   *
   * Fail-safe per ADR-0003 — *when we cannot prove work is safe to discard, we
   * keep it*. Concretely: a ref-delete that fails stops the prune rather than
   * escalating to a directory removal; the `gc` is a plain one, never
   * `--prune=now`; and **the newest point always survives**, however old it is.
   * A store that grew larger than expected is an inconvenience; a store that
   * pruned the 02:00 snapshot the operator came for is the failure the
   * requirement exists to prevent.
   */
  async prune(repoRoot: string, keepMs = SNAPSHOT_RETENTION_MS): Promise<number> {
    const store = this.storePathFor(repoRoot);
    if (!store || !existsSync(join(store, 'HEAD'))) return 0;
    const points = await this.listPoints(repoRoot);
    if (points.length < 2) return 0;
    const cutoff = Date.now() - Math.max(0, keepMs);
    // `slice(0, -1)`: the newest point is never a candidate.
    const doomed = points.slice(0, -1).filter((p) => p.ts > 0 && p.ts < cutoff);
    let dropped = 0;
    for (const p of doomed) {
      const r = await this.git(store, ['--git-dir', store, ...GIT_CFG, 'update-ref', '-d', p.ref, p.sha]);
      if (!r.ok) {
        this.warn('prune stopped — a ref could not be dropped, so the store is left intact', repoRoot, r.err);
        return dropped;
      }
      dropped++;
    }
    if (dropped) {
      const gc = await this.git(store, ['--git-dir', store, ...GIT_CFG, 'gc', '--quiet']);
      if (!gc.ok) this.warn('prune dropped refs but gc failed — the store is intact, just larger', repoRoot, gc.err);
    }
    return dropped;
  }

  // ── plumbing ──────────────────────────────────────────────────────────────

  /** The argument prefix that makes git operate on the shadow store over the
   *  operator's work tree. Note what is NOT here: any index env var. `--git-dir`
   *  alone makes the index default to `<store>/index` (Pitfall 7, measured), and
   *  requiring one would force `git.ts`'s `runGit` to grow an `env` parameter it
   *  does not have. */
  private base(store: string, repoRoot: string): string[] {
    return ['--git-dir', store, '--work-tree', repoRoot, ...GIT_CFG];
  }

  /** One git child. Copied in shape from gitCommitter's `gitAsync`, including
   *  its `inFlight` bookkeeping, for the reason in the module header: same
   *  mechanism, different repo, different lock. */
  private git(store: string, args: string[]): Promise<{ ok: boolean; out: string; err: string }> {
    return new Promise((resolve) => {
      let out = '';
      let err = '';
      this.inFlight.add(store);
      const done = (ok: boolean): void => { this.inFlight.delete(store); resolve({ ok, out, err }); };
      try {
        const child = spawn('git', args, { timeout: GIT_TIMEOUT_MS });
        child.stdout?.on('data', (d) => { out += d.toString(); });
        child.stderr?.on('data', (d) => { err += d.toString(); });
        child.on('error', (e) => { err += String(e); done(false); });
        child.on('close', (code) => done(code === 0));
      } catch (e) { err = String(e); done(false); }
    });
  }

  /** Delete an ABANDONED `<store>/index.lock`. Never one of ours (`inFlight`),
   *  never one younger than STALE_LOCK_MS — which stays well above our own git
   *  timeout, or a slow-but-alive `add -A` behind Windows antivirus has its LIVE
   *  lock deleted out from under it. */
  private clearStaleLock(store: string): void {
    if (this.inFlight.has(store)) return;
    const lock = join(store, 'index.lock');
    try {
      if (existsSync(lock) && Date.now() - statSync(lock).mtimeMs > STALE_LOCK_MS) rmSync(lock);
    } catch { /* noop */ }
  }

  /** Say it out loud, on the log an operator already reads, and never throw into
   *  the caller — a failed restore point must not take the floor down with it. */
  private warn(what: string, repoRoot: string, detail: string): void {
    console.warn(`[restore] ${what}: ${repoRoot} — ${detail.trim()}`);
    try { this.deps.log?.({ kind: 'restore-point-error', what, repo: repoRoot, detail: detail.trim() }); }
    catch { /* the log is best-effort too */ }
  }
}
