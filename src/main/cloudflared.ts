/**
 * Acquiring the `cloudflared` binary this app spawns for the public tunnel
 * (DAEMON-05 / D-14).
 *
 * Cloudflare publishes no checksum file for its GitHub releases — no
 * SHA-256SUMS-equivalent, no `.sha256`, no `.sig`. The only digest available is
 * GitHub's own `assets[].digest` field on the release API, and that is
 * same-origin integrity, not provenance: it proves the bytes match what GitHub
 * recorded at upload time, and nothing about who built them or whether the
 * upload itself was compromised. So the digests below are a REPO CONSTANT,
 * fetched from that same API in the session that wrote this file and pasted
 * into the plan's own record — never re-derived from the vendor at install
 * time, and never trusted from a "latest" pointer that could move under us.
 * This is the same class of gap this repo already shipped and fixed once
 * (issue #57 — an MSI installer run before its checksum was verified); this
 * module exists so `cloudflared` does not repeat it.
 *
 * Deliberately: no PATH probe exists here. The only cloudflared this app ever
 * spawns is one whose SHA-256 matched a digest committed in this repo — a
 * "use it if it's already on PATH" rung would be three lines and would hand
 * the trust decision to a binary nobody here verified. Do not add it back as
 * an optimisation.
 *
 * The acquisition shape below is `nodeInstall.ts`'s `resolveNodeInstaller`
 * pattern (refuse without a digest, `null` for an unsupported platform/arch
 * with a stated reason), copied on purpose: it is the one place this repo
 * already download-verifies a platform binary before executing it. The one
 * divergence PATTERNS assigns: `nodeInstall.ts`'s `shaFor()` reads a real
 * checksums file the vendor publishes; Cloudflare publishes nothing to read,
 * so `resolveCloudflared` is pure and needs no fetcher argument at all — the
 * digest is a map lookup, not a network call.
 *
 * Deliberately free of any `electron` import so `node --test` can drive every
 * platform branch with no network (test/tunnel.test.cjs). All Electron
 * specifics (the destination directory) are the caller's problem — this
 * module only resolves URLs/digests and writes verified bytes to a path it is
 * handed.
 */
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/** The exact release this app acquires. Never `releases/latest` — a moving
 *  pointer would silently swap the binary a committed digest below verifies
 *  against, on the vendor's own schedule rather than this repo's. */
export const CLOUDFLARED_RELEASE_TAG = '2026.8.2';

/** filename -> SHA-256 (64 lowercase hex). One entry per supported artifact.
 *  Fetched from `GET /repos/cloudflare/cloudflared/releases/tags/<tag>`'s
 *  `assets[].digest` in the session that wrote this file (2026-08-23) — see
 *  the SUMMARY for the exact request and the full 26-asset response. Cloudflare
 *  ships no independent checksum file, so this map IS the verification: an
 *  artifact with no entry here is refused by `resolveCloudflared`, not
 *  silently trusted. */
export const CLOUDFLARED_SHA256: Record<string, string> = {
  // windows-amd64.exe: 54,893,480 B, retrieved 2026-08-23
  'cloudflared-windows-amd64.exe': 'c29eee2b121f5436a642eed69fd9767da7e7b8c510fa50aaa130337f931357b5',
  // linux-amd64 (bare binary, no extension): retrieved 2026-08-23
  'cloudflared-linux-amd64': 'fcfb02b575a52ca1af2e3267af4e1517bcdeb30ac48c834c69abaed3c0576ad2',
  // linux-arm64 (bare binary): retrieved 2026-08-23
  'cloudflared-linux-arm64': '7747d94570fb390cf47dcb4f9555c193c6355cda9793f0d878d9049e5d6a7790',
  // darwin-amd64.tgz (tarball, needs extraction): retrieved 2026-08-23
  'cloudflared-darwin-amd64.tgz': 'f1727723c586500e2092368ae21871b3df7ddfd2cb097f22d81bee4a9c458bb4',
  // darwin-arm64.tgz (tarball, needs extraction): retrieved 2026-08-23
  'cloudflared-darwin-arm64.tgz': '9042c2c5d8b2de78e60f313d5fb31b6c5c1cebde787a3caf1f2c9588084ac442'
};

/** The artifact for a platform/arch, or `null` when nothing is published for
 *  it. Copies `nodeArtifactFor`'s shape exactly: a stated reason lives beside
 *  every `null`, never a silent fallthrough. */
export function cloudflaredArtifactFor(
  platform: string,
  arch: string
): { file: string; kind: 'bin' | 'tgz' } | null {
  if (platform === 'win32') {
    // No cloudflared-windows-arm64 asset exists in this release (all 26 assets
    // of 2026.8.2 were enumerated) — refuse rather than silently handing a
    // Windows-on-ARM operator the amd64 binary under emulation.
    if (arch === 'arm64') return null;
    return { file: 'cloudflared-windows-amd64.exe', kind: 'bin' };
  }
  if (platform === 'linux') {
    return { file: arch === 'arm64' ? 'cloudflared-linux-arm64' : 'cloudflared-linux-amd64', kind: 'bin' };
  }
  if (platform === 'darwin') {
    // macOS ships as a tarball, not a bare binary — the one shape divergence
    // this module has to handle beyond the win32/linux bare-binary case.
    return { file: arch === 'arm64' ? 'cloudflared-darwin-arm64.tgz' : 'cloudflared-darwin-amd64.tgz', kind: 'tgz' };
  }
  return null;
}

const RELEASE_BASE = 'https://github.com/cloudflare/cloudflared/releases/download';

/** Resolve the exact artifact to acquire on THIS machine, digest included.
 *  Pure and synchronous — no fetcher, because there is nothing to fetch to
 *  resolve this (see the module header's one-divergence note). Returns `null`
 *  when the platform/arch is unsupported OR has no committed digest — the
 *  same "no digest -> refuse" branch `resolveNodeInstaller` carries, just with
 *  no network step in front of it. */
export function resolveCloudflared(
  platform: string = process.platform,
  arch: string = process.arch
): { file: string; url: string; sha256: string; kind: 'bin' | 'tgz' } | null {
  const artifact = cloudflaredArtifactFor(platform, arch);
  if (!artifact) return null;
  const sha256 = CLOUDFLARED_SHA256[artifact.file];
  // No committed digest -> we would be writing an unverified binary to disk. Refuse.
  if (!sha256) return null;
  return { file: artifact.file, url: `${RELEASE_BASE}/${CLOUDFLARED_RELEASE_TAG}/${artifact.file}`, sha256, kind: artifact.kind };
}

type Fetcher = (url: string) => Promise<{ ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> }>;

/** This is an explicit operator action (turning the tunnel on), not a hot
 *  path, so the timeout is generous — the artifact is ~20-55 MB, an order of
 *  magnitude bigger than anything else this app fetches over HTTP. */
const timedFetch: Fetcher = (url) =>
  fetch(url, { signal: AbortSignal.timeout(60_000) }) as unknown as ReturnType<Fetcher>;

/**
 * Resolve, download, verify, and write the cloudflared binary into `destDir`,
 * returning its path — or `null` on any failure. Order is non-negotiable:
 *
 *   1. a previously verified binary already at the destination path is
 *      returned as-is (this function never writes a file it did not itself
 *      verify, so an existing one at this path was already checked);
 *   2. otherwise: resolve the artifact -> download the whole thing into memory
 *      -> hash it -> compare to the committed digest -> ONLY THEN write it to
 *      disk (and `chmod 0o755` on POSIX, and extract a `.tgz` after the digest
 *      matched, never before).
 *
 * The whole artifact is buffered in memory rather than streamed to disk while
 * hashing, and that is deliberate: a streaming write would put an unverified
 * file on disk under the name a later run treats as trusted, for however long
 * the hash comparison takes. Fifty-odd megabytes held once, on an explicit
 * operator action, is the cheap side of that trade.
 *
 * A digest mismatch is loud (`console.error`, naming the expected/actual
 * digest, the artifact, and issue #57) and leaves nothing behind: no partial
 * file, no half-verified binary. A silent `null` here would be
 * indistinguishable from being offline, and those two need different operator
 * responses.
 */
export async function ensureCloudflared(
  destDir: string,
  opts: { platform?: string; arch?: string; fetchImpl?: Fetcher } = {}
): Promise<string | null> {
  const platform = opts.platform ?? process.platform;
  const arch = opts.arch ?? process.arch;
  const binPath = join(destDir, platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  if (existsSync(binPath)) return binPath;

  const resolved = resolveCloudflared(platform, arch);
  if (!resolved) return null;

  const fetchImpl = opts.fetchImpl ?? timedFetch;
  let bytes: Buffer;
  try {
    const res = await fetchImpl(resolved.url);
    if (!res.ok) return null;
    bytes = Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }

  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== resolved.sha256) {
    console.error(
      `[cloudflared] digest mismatch for ${resolved.file}: expected ${resolved.sha256}, got ${actual} `
      + '— refusing to write an unverified binary to disk (see issue #57, "msiexec ran on an unverified MSI")'
    );
    return null;
  }

  mkdirSync(destDir, { recursive: true });
  if (resolved.kind === 'tgz') {
    const tgzPath = join(destDir, resolved.file);
    writeFileSync(tgzPath, bytes);
    try {
      // The digest matched BEFORE this line runs — extraction never happens
      // ahead of verification.
      execFileSync('tar', ['-xzf', tgzPath, '-C', destDir], { stdio: 'ignore' });
    } finally {
      try { rmSync(tgzPath); } catch { /* best-effort cleanup of the intermediate archive */ }
    }
  } else {
    writeFileSync(binPath, bytes);
  }
  if (!existsSync(binPath)) return null; // the tarball's own layout did not produce the expected name
  if (process.platform !== 'win32') {
    try { chmodSync(binPath, 0o755); } catch { /* best-effort; a failed chmod still leaves a verified file */ }
  }
  return binPath;
}
