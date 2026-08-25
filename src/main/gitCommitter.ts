/**
 * GitCommitter — the hive's single git committer (ADR-0004).
 *
 * Lifted out of src/main/hive.ts (STRUCT-02): the debounced/retried commit
 * path, the FLOOR-04 secret scrub that runs inside its retry loop, and the
 * stale-lock recovery. HiveManager composes exactly one instance
 * (`this.committer`) and its own `commit()`/`flushCommit()` are one-line
 * delegations to it — never a second committer, per ADR-0004.
 *
 * Deliberately free of any `electron` import so `node --test` can drive the
 * whole commit path with a real git child process and no Electron runtime
 * (test/hive-durability.test.cjs, test/repo-claims.test.cjs). Everything
 * host-specific arrives through {@link GitCommitterDeps}, wired in hive.ts.
 */
import { existsSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { HOOK_SHIM, PROXY_BRIDGE_SHIM } from './hiveTemplates';

/**
 * Where the hive's own `git` looks for hooks: nowhere.
 *
 * The hive root IS a git repo (`git init` in HiveManager.ensureHive, hive.ts)
 * and this async wrapper spawns `git` as a child of the Electron MAIN
 * process, inheriting main's environment — as does hive.ts's blocking twin
 * (`git()`, used only by the one-shot `git init`). Nothing stopped an agent
 * writing `<root>/.git/hooks/pre-commit` and having the next hive commit
 * execute it — arbitrary code with more privilege than the agent that
 * planted it, reached from outside the PreToolUse write gate (which cannot
 * see the pi, opencode or proxy tiers at all).
 *
 * `core.hooksPath` rather than `--no-verify`, deliberately: `--no-verify`
 * suppresses only `pre-commit`/`commit-msg` on a commit, leaves `post-commit`
 * and every other hook running, and would have to be repeated at each of
 * commit()'s call sites. This is one flag in the shared `-c` prefix of BOTH
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

// ─── git budgets ──────────────────────────────────────────────────────────
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
/** Paths the hive repo must stop VERSIONING — see untrackIgnored(). Mirrors the
 *  churny half of the .gitignore seed in ensureHive; a `.gitignore` line alone
 *  does nothing to a file git is already tracking. */
const UNTRACK_PATHS = ['cost-ledger.jsonl', 'log.jsonl', 'log.jsonl.1', 'backups'];

export interface GitCommitterDeps {
  /** The hive root to commit into, or null before onboarding (no
   *  harnessHome configured yet — mirrors HiveManager.root()). commit()
   *  degrades to a no-op on null rather than resolving a path off it. */
  root: () => string | null;
  /** Append one event to the hive's durable log (HiveManager.appendLog).
   *  Injected so the scrub's secret-scan-skipped/secret-blocked/
   *  secret-scrubbed events land on the SAME log an operator already reads,
   *  instead of a second logging path this class would have to invent. */
  log: (event: Record<string, unknown>) => void;
  /**
   * Redact secret-shaped values from a text blob (HiveManager's own
   * redactSecrets, also used by the voice/mail read-layer). Injected rather
   * than imported: hive.ts already imports GitCommitter, and a back-import
   * would make the two files mutually dependent for no reason — the matcher
   * is a pure function, not committer-specific state.
   */
  redactSecrets: (text: unknown) => string;
}

/** The hive's single git committer (ADR-0004). Debounced, retried, off the
 *  main thread, with the FLOOR-04 secret scrub riding inside the retry loop
 *  and stale `.git/index.lock` recovery. See hive.ts's `commit()`/
 *  `flushCommit()` for the one-line delegations that make this the only
 *  instance. */
export class GitCommitter {
  constructor(private readonly deps: GitCommitterDeps) {}

  /** Set while a git child WE spawned is alive, so clearStaleLock can never
   *  delete an index.lock that belongs to a live child of ours. */
  private gitInFlight = false;

  /** Async git child, awaited instead of blocking the loop (hive.ts's own
   *  `git()` is the blocking twin, used only by the one-shot `git init`). */
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
    const root = this.deps.root();
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
   * THE SINGLE-COMMITTER PREMISE ABOVE IS FALSE AS WRITTEN, and this is the
   * place to say so rather than the place to assume it. AGENT_DENY_RULES has no
   * `git add` rule, no `git commit` rule and no `git -C` rule — measured — so an
   * agent can run `git -C "$HIVE_ROOT" add -A && git -C "$HIVE_ROOT" commit -m x`
   * and never reach flushCommit or this scrub at all. Closing it is a deny-rule
   * change with a blast radius this comment cannot measure (agents legitimately
   * commit in their OWN worktrees, and a deny rule that wedges every agent's git
   * is a worse failure than the one it prevents), so it is RECORDED here and
   * owned by the residual register, not silently patched.
   *
   * WHY redactSecrets AND NOT A SECOND MATCHER. The project trusts exactly one
   * pattern set; the mail path already runs every subject and body through it.
   * Two matchers that disagree is worse than one imperfect matcher, because the
   * disagreement is silent — the commit path would accept what the mail path
   * redacts. This call site does not change the battery, which is under a
   * LOCKSTEP contract with test/voice-messages.test.cjs.
   *
   * THE CEILING — BOUNDED, MEASURED, AND NOT NEGOTIABLE DOWNWARD.
   *
   * FLOOR-04's own wording is *"so it never reaches git history"*. No regex
   * delivers "never", and this control has now been measured twice proving it.
   * WHAT IT DOES DELIVER, exactly: labelled `key=value` / `key: value` pairs,
   * plus ten vendor prefixes (the eight in pattern 3 after the sk- split and
   * the two underscore-spelled ones in pattern 6), matched on ADDED lines only,
   * ON ONE LINE, under two size caps. Everything below is what that leaves open.
   * Each item is pinned by a test in test/hive-durability.test.cjs and
   * test/voice-messages.test.cjs rather than promised here.
   *
   * FIVE ACTIVE BYPASSES. Each is an ACTION AN AGENT TAKES, not a passive limit.
   *
   *  1. LINE-CHUNKING, and WHERE THE CUT FALLS DECIDES IT. addedLines joins `+`
   *     lines with `\n`, so no pattern spans a line break. Measured, labelled:
   *       `const KEY = "sk_live_EX_Hxxxxxxxxxxxxyyyyzzzzwwww";`     -> 1 hit here
   *       `const A = "sk_live_" + "51Hxxxxxxxxxxxx";`              -> 0 hits
   *     A cut INSIDE the vendor prefix is never scanned, at any size, on any
   *     line count. A cut AFTER the prefix plus ten body characters is caught in
   *     the head and leaks the tail. Closing this needs a whole-blob scanner,
   *     which is a different design.
   *  2. THE LINE CAP — CLOSED 2026-08-25, kept here because the shape is worth
   *     remembering. It used to read: `seq 20001 > pad.txt` in the same debounce
   *     window pushes --numstat past SECRET_SCAN_MAX_LINES and sends the WHOLE
   *     commit, secret included, down the `committing UNSCANNED` path. One
   *     padded file disabled the scanner for every OTHER file in the commit.
   *     Not theoretical: it fired twice on an operator's machine (105,089 and
   *     106,609 lines) before anyone looked. The cap now applies PER FILE — an
   *     enormous single file is still skipped, and named, but it can no longer
   *     take its neighbours with it.
   *  3. THE BYTE CAP. Past SECRET_SCAN_MAX_BYTES the diff is slice()d and
   *     everything after the cut is never scanned. Same shape, one level up.
   *     Narrowed by the same change — the byte budget is now spent file by file
   *     and each exhausting file is named — but NOT closed: a commit past the
   *     total byte budget still leaves later files unscanned.
   *  4. QUOTED-KEY JSON. `{"token": "…"}` and `obj["token"] = "…"` are both
   *     unmatched — the closing quote and the `]` break key-to-delimiter
   *     adjacency. An arm for it was BUILT, MEASURED and REJECTED ON ITS COST:
   *     it gains 2 detections and costs 2 of the 12 demonstrated false positives
   *     (`"api_key": "$OPENAI_API_KEY"` and `"secret": "REPLACE_ME"` — a config
   *     template and a scaffold placeholder, both shapes agents write
   *     constantly), and over 400 commits it costs 0 additional paths, so those
   *     2 ARE the cost. +2 detections do not buy 2 permanent unstages. That is
   *     the whole reason. It is NOT rejected because a value-shape predicate on
   *     it would re-open the door that lost 15 detections — it would not; those
   *     were lost to a predicate on PATTERN 5, the only arm covering labelled
   *     key=value, where a predicate subtracts from live detections.
   *  5. `printf '* -diff' > .gitattributes` — ONE LINE, PERSISTENT, AND THE ONLY
   *     ONE THAT LOGS NOTHING AT ALL. Every diff then reads `Binary files …
   *     differ`; --numstat reports `-`/`-`, so `Number('-') || 0` makes `changed`
   *     0 and the SECRET_SCAN_MAX_LINES branch never fires; addedLines is empty
   *     and this function returns true having scanned nothing. Both size caps at
   *     least print `committing UNSCANNED` and append a log row; this one writes
   *     no warning and no log row, and unlike `seq 20001 > pad.txt` it persists
   *     for every future commit until a human reads .gitattributes. It is the
   *     agent-controllable escalation of the sentence that follows.
   *
   * Binary blobs produce no `+` lines and are never scanned.
   *
   * DECLARED LOSS, carried here so it is not discoverable only by reading a
   * regex: the \b on pattern 3's BARE sk- arm means a LEGACY bare sk-<alnum>
   * OpenAI key glued to a preceding word character (`q=key%3Dsk-A1B2…`) is no
   * longer redacted — 5 measured shapes, pinned as declared losses in
   * test/voice-messages.test.cjs. `sk-ant-`, `sk-proj-` and `sk-svcacct-` are
   * unbounded and keep matching in every one of those contexts. Separately,
   * pattern 6's two arms redact ordinary identifiers of the form
   * `sk_test_helper_function` / `rk_live_stream_handler`; measured over 481
   * tracked text files and 400 commits that family unstages nothing here, which
   * is a property of THIS corpus and not of the arms.
   *
   * THE FALSE-POSITIVE RATE, AS A NUMBER, AND IT IS THE BIGGER FACT. Replayed
   * over the last 400 commits with this function's own algorithm — the window
   * is COMMIT-RELATIVE, so the tip and the variant are part of the number:
   * `git log -n 400 0b3d631`, with addedLines keeping the leading `+` exactly
   * as it does above (strip it and the same data answers 67/66). Under the
   * matcher this replaced, 50 of those commits (12.5%) would have had at least
   * one path silently dropped, across 66 distinct paths. Under the matcher in
   * this commit: 48 (12.0%) across 65. The DISTINCT-PATH count is the stable
   * half; the percentage moves as the window rolls.
   * The dominant shapes are `token: string):`, `secret: string` and
   * `botToken: string` — ordinary TypeScript, not credentials. WHAT THAT COSTS:
   * unstagePath drops the file from the commit, the `secret-scrubbed` log line
   * is indistinguishable from a real credential catch, and the agent's work
   * never reaches history. This commit rescues `desk-backend-engineer` and
   * `desk-market-researcher` (four tracked files) and, in the replay window,
   * `docs/blog/command-center-guide/index.html`. THE REST ARE OPEN, owned by the
   * residual register, and NOT closable by tightening pattern 5 — that is the
   * mechanism that lost 4 credential classes in one attempt and 11 in the next.
   *
   * This is defence in depth, not a guarantee, and no doc may claim more of it.
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
      this.deps.log({ kind: 'secret-scan-skipped', reason: 'diff-failed' });
      return true;
    }
    if (!stat.out.trim()) return true; // nothing staged — nothing to scan
    let changed = 0;
    const rows: { path: string; lines: number }[] = [];
    for (const row of stat.out.split('\n')) {
      const [added, deleted, ...rest] = row.split('\t');
      const n = (Number(added) || 0) + (Number(deleted) || 0); // '-' (binary) → 0
      changed += n;
      const p = rest.join('\t').trim();
      if (p) rows.push({ path: p, lines: n });
    }

    // 2. core.quotePath=false so a non-ASCII path comes back raw and can be
    //    handed straight back to `restore --staged`; -U0 drops context lines,
    //    which are unchanged content and so cannot be a NEW leak.
    const DIFF_ARGS = ['-c', 'core.quotePath=false', 'diff', '--cached', '--unified=0', '--no-color', '--no-ext-diff'];

    let text: string;
    if (changed <= SECRET_SCAN_MAX_LINES) {
      // Common case: one diff, one regex battery. Unchanged.
      const diff = await this.gitAsync(DIFF_ARGS, root);
      if (!diff.ok) {
        console.warn('[hive] FLOOR-04: could not read the staged diff — committing UNSCANNED:', diff.err.trim());
        this.deps.log({ kind: 'secret-scan-skipped', reason: 'diff-failed' });
        return true;
      }
      text = diff.out.slice(0, SECRET_SCAN_MAX_BYTES);
      if (text.length < diff.out.length) {
        console.warn(`[hive] FLOOR-04: staged diff is ${diff.out.length} bytes — only the first ${SECRET_SCAN_MAX_BYTES} were scanned`);
        this.deps.log({ kind: 'secret-scan-truncated', bytes: diff.out.length, scanned: text.length });
      }
    } else {
      // OVER THE CAP — SCAN PER FILE INSTEAD OF SKIPPING EVERYTHING.
      //
      // This closes ACTIVE BYPASS 2 documented above. The cap used to apply to
      // the TOTAL, so `seq 20001 > pad.txt` in the same debounce window sent the
      // whole commit — secret included — down the `committing UNSCANNED` path.
      // One padded file disabled the scanner for every OTHER file in the commit,
      // which is a one-command, agent-controllable way to walk a credential into
      // history. Observed twice on the operator's own machine (105,089 and
      // 106,609 lines), so this is not theoretical.
      //
      // Per file, the cap still bounds the work — a genuinely enormous single
      // file is still skipped — but it can no longer take its neighbours with it.
      // Skipped files are NAMED, because "which file went unscanned" is the
      // question an operator actually has, and the old message could not answer it.
      const parts: string[] = [];
      const skipped: string[] = [];
      let budget = SECRET_SCAN_MAX_BYTES;
      for (const { path: rel, lines } of rows) {
        if (lines > SECRET_SCAN_MAX_LINES) { skipped.push(`${rel} (${lines} lines)`); continue; }
        if (budget <= 0) { skipped.push(`${rel} (byte budget exhausted)`); continue; }
        const one = await this.gitAsync([...DIFF_ARGS, '--', rel], root);
        if (!one.ok) { skipped.push(`${rel} (diff failed)`); continue; }
        const slice = one.out.slice(0, budget);
        budget -= slice.length;
        parts.push(slice);
      }
      text = parts.join('\n');
      console.warn(
        `[hive] FLOOR-04: staged diff is ${changed} lines, over the ${SECRET_SCAN_MAX_LINES} cap — `
        + `scanned ${parts.length}/${rows.length} files individually`
        + (skipped.length ? `; UNSCANNED: ${skipped.join(', ')}` : '; none skipped')
      );
      this.deps.log({
        kind: 'secret-scan-chunked', lines: changed,
        scanned: parts.length, total: rows.length, skipped
      });
    }

    // 3. One pass over every added line in the whole diff. The common case is
    //    clean and pays for a single regex battery, not a per-file split.
    const all = addedLines(text);
    if (!all || this.deps.redactSecrets(all) === all) return true;

    // 4. Something matched — split per file to name it. `^diff --git ` is the
    //    per-file boundary; the b-side of `+++` is the path as it will be
    //    committed (it survives renames, where the a-side does not).
    let safe = true;
    for (const section of text.split(/^diff --git /m).slice(1)) {
      const plus = addedLines(section);
      if (!plus || this.deps.redactSecrets(plus) === plus) continue;
      const rel = /^\+\+\+ b\/(.+)$/m.exec(section)?.[1];
      if (!rel) {
        console.warn('[hive] FLOOR-04: a secret-shaped value is staged under a path this scrub could not name — NOT committing');
        this.deps.log({ kind: 'secret-blocked', reason: 'unresolved-path' });
        safe = false;
        continue;
      }
      if (await this.harnessAuthored(root, rel)) continue;
      if (!(await this.unstagePath(root, rel))) {
        console.warn(`[hive] FLOOR-04: ${rel} carries a secret-shaped value and could NOT be unstaged — NOT committing`);
        this.deps.log({ kind: 'secret-blocked', reason: 'unstage-failed', path: rel });
        safe = false;
        continue;
      }
      console.warn(
        `[hive] FLOOR-04: unstaged ${rel} — it carries a secret-shaped value, and it has been kept OUT of the hive's `
        + 'git history. The file is untouched on disk; remove the credential from it, or it will be skipped again on every commit.'
      );
      this.deps.log({ kind: 'secret-scrubbed', path: rel });
    }
    return safe;
  }

  /** The debounced commit body — async end to end. Two attempts at a 2 s timeout,
   *  with a TIMER backoff rather than a blocking sleep: a repo whose lock is held
   *  by something outside this process is retried by the next mutation anyway, so
   *  a long in-process fight buys nothing and costs the supervisor. */
  async flushCommit(root: string): Promise<void> {
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
