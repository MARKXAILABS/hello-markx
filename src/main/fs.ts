import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, normalize, parse, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { imageMimeForPath } from '../shared/imageTypes';

/**
 * Confines `path` inside `root` to prevent path-traversal escapes.
 * Returns the resolved absolute path on success, or null on violation.
 *
 * Exported so other main-process modules (e.g. git.ts) validate caller-supplied
 * relative paths against a workspace root with the SAME guard — there is exactly
 * one path-escape policy in the app and it lives here.
 */
export function safeJoin(root: string, rel: string): string | null {
  const absRoot = resolve(root);
  const absPath = isAbsolute(rel) ? normalize(rel) : resolve(absRoot, rel);
  // Compare the paths the OS will ACTUALLY use, not the strings the caller typed:
  // a symlink sitting INSIDE the root but pointing outside it passes a purely
  // textual containment check, and then the read/write lands on the target (#9).
  // `realish` degrades to the lexical path for anything not on disk yet — a file
  // about to be created, or a rel path validated against a git rev rather than
  // the working tree — so no legitimate caller loses.
  const rel2 = relative(realish(absRoot), realish(absPath));
  if (rel2.startsWith('..') || isAbsolute(rel2)) return null;
  return absPath;
}

/** The on-disk truth for `p`: its realpath when it exists, else its parent's
 *  realpath plus the final segment (the about-to-be-created file), else `p`
 *  unchanged. SYNC on purpose — every caller is a guard that has to answer
 *  before the work it guards. */
function realish(p: string): string {
  try { return realpathSync(p); } catch { /* not on disk */ }
  try { return join(realpathSync(dirname(p)), basename(p)); } catch { return p; }
}

/**
 * Is `p` inside at least one of `roots`?
 *
 * `safeJoin` confines a relative path to whatever root it was HANDED — and for
 * every `fs:*` / `git:*` IPC that root is named by the RENDERER, so on its own it
 * proves nothing about WHICH folder was opened (#9). This is the other half of
 * the guard: the caller-named root must itself be one of the app's managed
 * folders (a registered repo, the harness home, an agent's cwd). Both sides get
 * the same realpath treatment, so neither a symlinked root nor a symlinked
 * target escapes.
 *
 * Prefix comparison via `relative`, which is case-insensitive on win32 — the
 * same comparison `safeJoin` has always used.
 */
export function isWithinRoots(p: string, roots: readonly string[]): boolean {
  if (typeof p !== 'string' || !p.trim()) return false;
  const target = realish(resolve(expandTilde(p)));
  return roots.some((r) => {
    if (typeof r !== 'string' || !r.trim()) return false;
    const root = realish(resolve(expandTilde(r)));
    const rel = relative(root, target);
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  });
}

/**
 * May this string be handed to the OS to open? ONE policy, because there is more
 * than one door: the `app:openExternal` IPC (renderer buttons + the onboarding
 * System Settings deep-link) and `setWindowOpenHandler` (a `window.open`, or a
 * MIDDLE-CLICK on an AGENT-AUTHORED link — which the markdown click guard never
 * sees). The second door used to pass `shell.openExternal` anything at all, so a
 * crafted `file:` / `ms-msdt:` / `smb:` URL reached the OS handler (#8).
 *
 * https only, plus the macOS Settings deep-link for the one caller that needs it.
 * Deliberately NOT http: every in-app link path already goes through
 * `openExternal`, which has been https-only since it was written.
 */
export function isAllowedExternalUrl(url: unknown, opts: { settingsDeepLink?: boolean } = {}): boolean {
  if (typeof url !== 'string' || url.length > 2048) return false;
  if (opts.settingsDeepLink && url.startsWith('x-apple.systempreferences:')) return true;
  return url.startsWith('https://') && url.length > 'https://'.length;
}

export interface DirEntry {
  name: string;
  isDir: boolean;
  size: number;
  mtime: number;
}

export async function listDir(root: string, rel: string): Promise<{
  ok: true; entries: DirEntry[]; path: string;
} | { ok: false; error: string }> {
  const abs = safeJoin(root, rel);
  if (!abs) return { ok: false, error: 'path escapes root' };
  try {
    const names = await readdir(abs);
    const entries = await Promise.all(names.map(async (name): Promise<DirEntry> => {
      try {
        const s = await stat(join(abs, name));
        return { name, isDir: s.isDirectory(), size: s.size, mtime: s.mtimeMs };
      } catch {
        return { name, isDir: false, size: 0, mtime: 0 };
      }
    }));
    entries.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return { ok: true, entries, path: abs };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const MAX_READ_BYTES = 2 * 1024 * 1024; // 2 MB

export async function readFileText(root: string, rel: string): Promise<{
  ok: true; content: string; path: string; size: number;
} | { ok: false; error: string }> {
  const abs = safeJoin(root, rel);
  if (!abs) return { ok: false, error: 'path escapes root' };
  try {
    const s = await stat(abs);
    if (s.size > MAX_READ_BYTES) {
      return { ok: false, error: `file too large (${(s.size / 1024 / 1024).toFixed(1)} MB)` };
    }
    const buf = await readFile(abs);
    // Reject obvious binary files based on null-byte sniff
    if (buf.includes(0)) return { ok: false, error: 'binary file (not displayable)' };
    return { ok: true, content: buf.toString('utf8'), path: abs, size: s.size };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Ceiling for the BINARY read. Deliberately larger than MAX_READ_BYTES (2 MB):
 * that cap exists to stop Monaco choking on a huge text buffer, and applying it
 * to images would reject the exact files people want to look at — a retina
 * screenshot of a full 5K display is routinely 3–6 MB. 10 MB covers real
 * screenshots and design assets while still refusing to hand the renderer a
 * video-sized payload over structured clone.
 */
const MAX_BINARY_READ_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Read a file as raw BYTES, confined to `root` by the same `safeJoin` guard as
 * every other fs entry point here.
 *
 * Exists because the text path deliberately refuses binary content (the
 * null-byte sniff in readFileText), which meant a PNG in an agent's workspace
 * was completely unviewable inside the app — the IDE opened a tab that said
 * "binary file (not displayable)" and stopped there. The renderer cannot reach
 * the file itself: the CSP is `default-src 'self'` with no `file:` source and
 * there is no registered file protocol, so `<img src="file://…">` silently
 * fails. Bytes therefore have to travel over IPC, and the renderer turns them
 * into a `blob:` URL (already allowed by `img-src`).
 *
 * NEVER reads unbounded: the size is checked from stat BEFORE opening, and
 * re-checked against the bytes actually read so a file that grows between the
 * two calls can't slip past the cap.
 */
export async function readFileBinary(root: string, rel: string, maxBytes = MAX_BINARY_READ_BYTES): Promise<{
  ok: true; bytes: Uint8Array<ArrayBuffer>; mime: string; path: string; size: number;
} | { ok: false; error: string }> {
  const abs = safeJoin(root, rel);
  if (!abs) return { ok: false, error: 'path escapes root' };
  try {
    const s = await stat(abs);
    // Directories and FIFOs are the trap here: readFile on a directory throws
    // (fine) but on a FIFO it BLOCKS forever with no size to check against, which
    // would hang the IPC call and, with it, the renderer's loading state.
    if (!s.isFile()) return { ok: false, error: 'not a regular file' };
    if (s.size > maxBytes) {
      return { ok: false, error: `file too large (${(s.size / 1024 / 1024).toFixed(1)} MB)` };
    }
    const buf = await readFile(abs);
    if (buf.byteLength > maxBytes) {
      // The file grew between stat and read. Rare, but the cap is a memory
      // guarantee for the renderer, not an advisory.
      return { ok: false, error: 'file grew past the size limit while reading' };
    }
    // COPY into a freshly-allocated Uint8Array instead of forwarding the Buffer.
    // Node serves small reads out of a shared 8 KB Buffer pool, so a pooled
    // Buffer is a VIEW onto memory that also holds unrelated recently-read
    // bytes; structured-clone carries the whole backing ArrayBuffer across the
    // IPC boundary, not just the view. Copying keeps the renderer's payload
    // exactly the file and nothing else.
    const bytes = new Uint8Array(buf.byteLength);
    bytes.set(buf);
    return {
      ok: true,
      bytes,
      mime: imageMimeForPath(abs) ?? 'application/octet-stream',
      path: abs,
      size: s.size
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function writeFileText(root: string, rel: string, content: string): Promise<{
  ok: true; path: string;
} | { ok: false; error: string }> {
  const abs = safeJoin(root, rel);
  if (!abs) return { ok: false, error: 'path escapes root' };
  try {
    await writeFile(abs, content, 'utf8');
    return { ok: true, path: abs };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Expand a leading `~` to the user's home dir and return an absolute, normalized
 * path. SYNC on purpose — every consumer (spawn guards, cwd validation, config
 * writes) is synchronous.
 *
 * Only a SHELL expands `~`; Node's `fs`/`child_process` treat it as a literal
 * directory name, so a user-typed `~/dev/foo` fails every existsSync/statSync and
 * dies with `cwd does not exist`. This is applied at INGESTION (project add,
 * `pty:spawn`) so the registry only ever stores an ABSOLUTE cwd, with
 * defense-in-depth at the consumers.
 *
 * Non-tilde absolute paths are returned NORMALIZED — separators canonicalized,
 * `..` collapsed, trailing separator dropped — and nothing else. Anything that is
 * still RELATIVE after expansion is returned untouched (trimmed) so callers keep
 * their own "not-absolute" errors instead of it being silently resolved against
 * the Electron process cwd. Empty input passes straight through. Windows paths
 * (`C:\…`, UNC) are unaffected — they never start with `~`.
 */
export function expandTilde(p: string): string {
  if (typeof p !== 'string') return p;
  const t = p.trim();
  if (!t) return p;
  let out = t;
  if (t === '~') out = homedir();
  else if (t.startsWith('~/') || t.startsWith('~\\')) out = join(homedir(), t.slice(2));
  if (!isAbsolute(out)) return t;
  // normalize(), NOT resolve(). resolve() anchors to `process.cwd()`, and on
  // WINDOWS a rooted-but-driveless path (`/hive`, `\hive` — `isAbsolute` says
  // true for both) then silently acquires whatever drive the app happened to
  // launch from: `/hive` becomes `E:\hive` from E:, `C:\hive` from C:. These
  // values are PERSISTED (harnessHome, recentHives, an agent's registry cwd), so
  // that borrowed letter is frozen into config — the same input yields two
  // different homes across two launches, which also defeats the dedup in
  // normalizeHiveHome(). It is the identical hazard the relative-path branch
  // above exists to avoid: this expander never anchors a path to the Electron
  // process cwd. Anchoring stays where it belongs, at USE time (safeJoin /
  // isWithinRoots both resolve, and resolve(normalize(x)) === resolve(x)).
  const n = normalize(out);
  // normalize() keeps a trailing separator; the stored form never has one —
  // except on a bare root (`/`, `C:\`, `\\server\share\`), which IS its own root.
  return n.length > parse(n).root.length ? n.replace(/[\\/]+$/, '') : n;
}

/**
 * Normalize the hive home and its recent-list in one place (#140).
 *
 * Onboarding SUGGESTS `~/HarnessAgents` in a free-text field, so the single most
 * common setup path — accept the default, press Finish — used to persist a literal
 * `~`. Finish immediately creates that directory, and Node's mkdir has no concept
 * of `~`: it tried to create a folder literally named "~" and died with
 * `ENOENT: no such file or directory, mkdir '~/HarnessAgents'`, wedging the wizard
 * on its last step. Expanding at the config-write boundary means every downstream
 * reader — mkdir, the hive root, the launch picker — sees one absolute path.
 *
 * `prior` is normalized too: entries written before this existed would otherwise
 * let the launch picker hand a stale `~/…` string straight back and reintroduce
 * the same failure. Deduped against the new home, newest first, capped.
 */
export function normalizeHiveHome(
  home: string,
  prior: readonly string[] = [],
  cap = 8
): { home: string; recentHives: string[] } {
  // Dedup KEY is case-folded on win32; the stored value keeps its original casing.
  // Windows paths are case-insensitive, so C:\Users\Me\Hive and c:\users\me\hive are
  // one directory and must not both sit in the recent list. isWithinRoots above already
  // relies on `relative()` being case-insensitive on win32 — this call site simply was
  // not following the rule the rest of the file does. Folding only the key means the
  // launch picker still shows the path the way the user typed it.
  const key = (p: string) => (process.platform === 'win32' ? p.toLowerCase() : p);
  const abs = expandTilde(home);
  const seen = new Set<string>([key(abs)]);
  const recentHives = [abs];
  for (const h of prior) {
    if (typeof h !== 'string' || !h.trim()) continue;
    const e = expandTilde(h);
    if (seen.has(key(e))) continue;
    seen.add(key(e));
    recentHives.push(e);
  }
  return { home: abs, recentHives: recentHives.slice(0, cap) };
}

/** Existence/metadata check for an ABSOLUTE path (v0.3.4 — backs the terminal
 *  ⌘-click markdown flow). `~/` is expanded here (the renderer doesn't know
 *  the home dir). Read-only metadata: returns whether a regular file exists and
 *  the normalized absolute path; never file contents. */
export async function statAbs(p: string): Promise<{ exists: boolean; isFile: boolean; path: string }> {
  let abs = p.startsWith('~/') ? join(homedir(), p.slice(2)) : p;
  if (!isAbsolute(abs)) return { exists: false, isFile: false, path: p };
  abs = normalize(abs);
  try {
    const s = await stat(abs);
    return { exists: true, isFile: s.isFile(), path: abs };
  } catch {
    return { exists: false, isFile: false, path: abs };
  }
}
