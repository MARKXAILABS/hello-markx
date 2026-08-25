/**
 * The public tunnel `SlackWebhookServer` and `WebhookServer` forward through —
 * one child process, spawned and closed the same way on every platform
 * (DAEMON-05 / D-13).
 *
 * The defect this file deletes: the tunnel used to run as a LIBRARY call
 * (`tunnelmole()`), which resolves with a URL string and nothing else — no
 * websocket, no disposer, genuinely no handle to capture. Both servers used to
 * carry a comment saying so, and it was true about that library call. It is
 * false about the capability. Running the SAME kind of tunnel as a CHILD
 * PROCESS instead makes the OS process handle the disposer the library never
 * exposed — the same principle `procKill.ts`'s header states for PTY children:
 * an explicit kill of the thing you spawned is always available; the old code
 * just never spawned anything to kill.
 *
 * Deliberately free of any `electron` import so `node --test` can drive the
 * whole lifecycle with a fake spawner (test/tunnel.test.cjs). `bin` and
 * `spawn` both arrive through {@link OpenTunnelOptions}, wired by callers in
 * `index.ts`.
 */
import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { hardKillTree } from './procKill';

/** What a caller gets back from a live tunnel: the public URL, and a way to
 *  close it. `stop()` is synchronous and idempotent — a second call is a
 *  no-op, matching every other `stop()` in this codebase. */
export interface TunnelHandle {
  url: string;
  stop(): void;
}

/** A closure a server hands its port to when — and only when — an operator
 *  action asks it to open a public tunnel. Nothing calls this on its own;
 *  see `startTunnel` on both servers. */
export type TunnelOpener = (port: number) => Promise<TunnelHandle>;

/** The shape of `node:child_process`'s real `spawn`, narrowed to what this
 *  module calls it with. Injectable because nothing in this repo fakes a
 *  spawner today (`hive.ts`'s `startProxyBridge` calls `spawn` directly) —
 *  without this injection point `test/tunnel.test.cjs` could not exist, and
 *  DAEMON-05's `stop()` -> `hardKillTree` proof would have no home. */
export type SpawnFn = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

export interface OpenTunnelOptions {
  /** Path to a digest-verified cloudflared binary. Resolved by the caller
   *  (`ensureCloudflared` against Electron's userData dir) rather than reached
   *  for here — resolving it in this file would put `app.isPackaged` in an
   *  electron-free module, the same rule `webhook.ts`/`slack.ts` already state
   *  in their own headers. */
  bin: string;
  /** Injected spawn function, defaulting to the real `node:child_process`
   *  `spawn`. See {@link SpawnFn} for why this exists. */
  spawn?: SpawnFn;
  /** How long to wait for cloudflared to report its tunnel URL before killing
   *  the child and rejecting. Defaults to 10s, matching the two servers' old
   *  `TUNNEL_START_TIMEOUT_MS` this replaces. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/** Cap on the accumulated stdout+stderr buffer scanned for the tunnel URL.
 *  cloudflared logs continuously for the life of the tunnel; without a cap a
 *  chatty (or misbehaving) child could grow memory unbounded before the
 *  timeout fires. A few KB is generously more than the banner ever is. */
const URL_SCAN_BUFFER_CAP = 8192;

/** cloudflared prints its assigned hostname inside a box-drawn banner on
 *  STDERR (not stdout), and not as the first line — a newline-delimited parse
 *  of "the first line" finds a box-drawing border character, not the URL. So
 *  this matches a regex over the WHOLE accumulated buffer, on either stream,
 *  rather than splitting on `\n`. */
const TRYCLOUDFLARE_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

/**
 * Spawn `cloudflared tunnel --url http://127.0.0.1:<port> --no-autoupdate` and
 * resolve once its public URL appears on stdout or stderr.
 *
 * Copies `hive.ts`'s `startProxyBridge` shape wholesale (the `settle`
 * idempotence latch, non-inherited stdio, `error`/`exit` both settling so a
 * dead child never hangs the promise, and an unref'd hard-ceiling timer), with
 * three deliberate divergences: stderr is piped and scanned too (cloudflared's
 * banner lives there); the match is a regex over the accumulated buffer, not
 * `indexOf('\n')`; and both pipes are kept draining after settling, because a
 * piped stream nobody reads fills the OS pipe buffer and blocks the child
 * forever — cloudflared keeps writing for as long as the tunnel is open, which
 * makes this the single most likely way this feature "works in the test and
 * wedges in the app".
 *
 * On timeout, the child is killed BEFORE the promise rejects — a rejected
 * `openTunnel` that leaves the child alive is a public origin with no handle,
 * the exact defect this file exists to delete, re-created on the error path.
 */
export async function openTunnel(port: number, opts: OpenTunnelOptions): Promise<TunnelHandle> {
  const spawnFn = opts.spawn ?? (nodeSpawn as SpawnFn);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<TunnelHandle>((resolve, reject) => {
    let settled = false;
    let buf = '';

    const child = spawnFn(
      opts.bin,
      [
        'tunnel',
        '--url', `http://127.0.0.1:${port}`,
        // Security flag, not a preference: cloudflared self-updates by default.
        // Left on, it would replace the digest-verified binary this app just
        // spawned with one nobody here verified, at runtime, inside a process
        // this app started.
        '--no-autoupdate'
      ],
      // Never `inherit` — the tunnel URL is effectively a capability address
      // for the whole floor, and `inherit` would write it into an agent's
      // terminal and into the app log.
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (typeof child.pid === 'number') hardKillTree(child.pid);
      reject(new Error(`cloudflared did not report a tunnel URL within ${timeoutMs}ms`));
    }, timeoutMs);
    timer.unref?.();

    const onChunk = (d: Buffer | string): void => {
      if (settled) return; // draining only past this point — see the header note
      buf = (buf + d.toString()).slice(-URL_SCAN_BUFFER_CAP);
      const m = TRYCLOUDFLARE_URL_RE.exec(buf);
      if (!m) return;
      settled = true;
      clearTimeout(timer);
      const url = m[0];
      let stopped = false;
      resolve({
        url,
        stop(): void {
          if (stopped) return;
          stopped = true;
          // The close is a call, not new code: hardKillTree(pid) already does
          // taskkill /T /F on win32 and group-SIGKILL on POSIX. Never
          // re-implemented here.
          if (typeof child.pid === 'number') hardKillTree(child.pid);
        }
      });
    };
    // Both pipes stay subscribed for the life of the child, settled or not —
    // an unread pipe fills the OS buffer and blocks cloudflared forever.
    child.stdout?.on('data', onChunk);
    child.stderr?.on('data', onChunk);

    child.on('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(e);
    });
    child.on('exit', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('cloudflared exited before reporting a tunnel URL'));
    });
  });
}
