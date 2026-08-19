import { createHash } from 'node:crypto';
import { posix } from 'node:path';

/** Every path in this module is POSIX-spelled on every platform, and joined with
 *  `posix.join` rather than `path.join`. Two reasons, both load-bearing:
 *  the alias root is the literal `/tmp/mdc`, and `codexRemoteEndpoint` returns a
 *  URI — URI path separators are `/` on every OS. Under `path.join` the endpoint
 *  came out on Windows with backslash separators after the `unix://` scheme,
 *  which no URI parser accepts (`new URL()` on it throws / mis-parses, and the
 *  Codex `--remote` flag would be handed a socket address that cannot resolve).
 *  Windows currently never reaches here (the caller in src/main/index.ts
 *  bails on win32 because Codex remote control wants an AF_UNIX socket, not a
 *  named pipe) — but a URI built with an OS-dependent joiner is wrong regardless
 *  of who calls it. */
export const CODEX_REMOTE_SOCKET_RELATIVE =
  'app-server-control/app-server-control.sock';

/** macOS caps a Unix socket path at 104 bytes (`sun_path`), and Codex builds its
 *  control socket as `$CODEX_HOME/app-server-control/app-server-control.sock` —
 *  42 bytes of suffix. So the alias home itself must fit in ~61 bytes.
 *
 *  `$TMPDIR` cannot host it: macOS spells it
 *  `/var/folders/xx/<30-char-hash>/T/` (49 bytes) and the alias came out at 121
 *  — LONGER than the 118-byte real home it was introduced to shorten, so every
 *  daemon start failed with `path must be shorter than SUN_LEN`. Root the alias
 *  at a fixed short prefix instead and keep the digest to 8 hex chars: the whole
 *  socket path then lands at 60 bytes with room to spare. */
export const CODEX_REMOTE_ALIAS_ROOT = '/tmp/mdc';

/** Longest socket path the platform will accept, minus a small safety margin. */
export const CODEX_REMOTE_SOCKET_MAX = 104;

/** Keep the CODEX_HOME spelling short enough for macOS's Unix-socket limit.
 *  `tempRoot` defaults to the short fixed root; callers may override it (tests). */
export function codexRemoteAliasPath(
  realHome: string,
  agentId: string,
  tempRoot: string = CODEX_REMOTE_ALIAS_ROOT
): string {
  const digest = createHash('sha256')
    .update(`${realHome}\0${agentId}`)
    .digest('hex')
    .slice(0, 8);
  return posix.join(tempRoot, digest);
}

/** Whether a candidate home yields a control socket the platform can bind. */
export function codexRemoteSocketFits(shortHome: string): boolean {
  return posix.join(shortHome, CODEX_REMOTE_SOCKET_RELATIVE).length < CODEX_REMOTE_SOCKET_MAX;
}

export function codexRemoteEndpoint(shortHome: string): string {
  return `unix://${posix.join(shortHome, CODEX_REMOTE_SOCKET_RELATIVE)}`;
}

/** Global options must precede `resume`, so prepend the endpoint in all cases. */
export function withCodexRemoteArgs(args: string[], endpoint: string): string[] {
  if (args.includes('--remote')) return args;
  return ['--remote', endpoint, ...args];
}
