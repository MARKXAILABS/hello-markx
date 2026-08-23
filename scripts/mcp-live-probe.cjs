#!/usr/bin/env node
/**
 * DAEMON-04's STOP gate. Re-confirms, with real marker-file "servers" spawned in
 * THIS session, which of Claude Code's two MCP-wiring channels actually starts a
 * server process:
 *
 *   - `mcpServers` inside a `--settings <file>.json` file      (the channel this
 *     app used to write into, and RESEARCH measured to be ignored unconditionally)
 *   - `mcpServers` inside a file passed via `--mcp-config <file>.json`
 *     (the channel RESEARCH measured to actually spawn the server)
 *
 * METHOD (02-RESEARCH.md §5). Two throwaway stdio "servers" — each just a
 * `node -e` one-liner that writes a marker file the instant it is spawned, then
 * stays alive a few seconds — one wired through `--settings`, one through
 * `--mcp-config`. One `claude --print` turn runs both channels at once
 * (`--strict-mcp-config` ON, this repo's policy — see D-25/hive.ts). A second,
 * separate turn runs `--settings` ALONE, into a fresh marker path, which is what
 * rules `--strict-mcp-config` out as the thing suppressing the settings channel
 * (rather than the channel genuinely being a no-op). After both turns: the
 * `--settings` marker must be ABSENT in both, and the `--mcp-config` marker must
 * be PRESENT in the first. Absence alone is satisfied by claude failing to start
 * at all, which is why the presence half is not optional.
 *
 * `claude mcp list` IS NOT A VALID PROBE. It reads the OPERATOR's own configured
 * servers (`~/.claude.json`) and reports on those — it ignores BOTH `--settings`
 * and `--mcp-config` entirely. Running it here would print a confident list of
 * servers that have nothing to do with either channel under test, i.e. a false
 * green against a channel that never spawned anything. This script never calls
 * it, and never will.
 *
 * Run: `node scripts/mcp-live-probe.cjs`. No dependencies beyond `claude` on
 * PATH and an authenticated session — never run this in CI (D-06/D-01).
 *
 * Exit codes:
 *   0  CHANNEL RE-CONFIRMED   — settings ignored, mcp-config spawned. The only
 *                               code that authorises building on `--mcp-config`.
 *   1  CHANNEL CHANGED        — any other combination, including `--settings`
 *                               now working. STOP: the design gets re-litigated,
 *                               not patched, if this ever fires.
 *   2  SKIPPED                — `claude` is not on PATH. STOP and report.
 *   3  INCONCLUSIVE           — claude exited non-zero on both turns and neither
 *                               marker was ever written (the authentication
 *                               case). STOP and report.
 */
const { spawnSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, existsSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const PRINT_TIMEOUT_MS = 45_000;
const SERVER_LIFETIME_MS = 6_000;

function log(line) {
  process.stderr.write(line + '\n');
}

// `claude` is an npm-global shim (`claude.cmd` on Windows) rather than a real
// .exe, so a non-shell spawnSync cannot resolve it via PATHEXT — the same
// reason pty.ts/shellEnv.ts's `where` probe runs with shell:true. Mirrored
// here rather than imported (this script stays repo-import-free, D-06/D-40).
const CLAUDE_SPAWN_OPTS = { shell: process.platform === 'win32' };

function claudeVersion() {
  const res = spawnSync('claude', ['--version'], { encoding: 'utf8', timeout: 10_000, ...CLAUDE_SPAWN_OPTS });
  if (res.error || res.status !== 0) return null;
  return (res.stdout || '').trim();
}

/** A throwaway stdio "server": writes `markerPath` the instant it starts, then
 *  stays resident for a few seconds so a real MCP handshake has something to
 *  talk to. The marker's mere existence afterward proves the process launched —
 *  this probe never needs the handshake itself to succeed. */
function serverSpec(markerPath) {
  // `node:fs`, not bare `fs` — a bare unprefixed fs-require string here would
  // itself read as a forbidden non-`node:` require to a joined-text scan of
  // THIS file's own source, even though it only ever runs inside the spawned
  // marker child, never in this process.
  const code = `require('node:fs').writeFileSync(process.env.MCP_PROBE_MARKER,String(Date.now()));`
    + `setTimeout(()=>{},${SERVER_LIFETIME_MS});`;
  return {
    command: process.execPath,
    args: ['-e', code],
    env: { MCP_PROBE_MARKER: markerPath }
  };
}

/** With `shell:true` on win32, Node concatenates args UNESCAPED (its own
 *  DEP0190 warning) — quoting is now the caller's job. Every arg this script
 *  ever passes is either a fixed literal or a path under this script's own
 *  `mkdtempSync` scratch dir, so a plain wrap-in-quotes (doubling any embedded
 *  `"`) is sufficient; no shell metacharacters are ever attacker-controlled
 *  here. A no-op on POSIX, where CLAUDE_SPAWN_OPTS.shell is false. */
function shellQuote(arg) {
  if (!CLAUDE_SPAWN_OPTS.shell) return arg;
  return `"${String(arg).replace(/"/g, '""')}"`;
}

function runClaudePrint(args) {
  const res = spawnSync(
    'claude',
    ['--print', shellQuote('reply with the single word ok'), ...args.map(shellQuote)],
    { encoding: 'utf8', timeout: PRINT_TIMEOUT_MS, ...CLAUDE_SPAWN_OPTS }
  );
  return {
    error: res.error ? String(res.error.message || res.error) : null,
    status: res.status,
    signal: res.signal,
    stdout: res.stdout || '',
    stderr: res.stderr || ''
  };
}

function main() {
  const version = claudeVersion();
  if (version === null) {
    log('[mcp-live-probe] SKIPPED — claude CLI not on PATH (or --version failed)');
    log('[mcp-live-probe] STOP: this plan cannot proceed without re-confirming the channel.');
    process.exit(2);
  }
  log(`[mcp-live-probe] claude --version: ${version}`);

  const scratch = mkdtempSync(join(tmpdir(), 'mcp-probe-'));
  let exitCode = 1;
  try {
    // ── Run 1: BOTH channels wired at once, --strict-mcp-config ON ──────────
    const settingsMarker1 = join(scratch, 'settings-marker-1.txt');
    const mcpConfigMarker1 = join(scratch, 'mcp-config-marker-1.txt');
    const settingsPath1 = join(scratch, 'settings-1.json');
    const mcpConfigPath1 = join(scratch, 'mcp-config-1.json');
    writeFileSync(settingsPath1, JSON.stringify({
      permissions: { deny: [] },
      mcpServers: { 'probe-settings-server': serverSpec(settingsMarker1) }
    }, null, 2));
    writeFileSync(mcpConfigPath1, JSON.stringify({
      mcpServers: { 'probe-mcp-config-server': serverSpec(mcpConfigMarker1) }
    }, null, 2));

    log('[mcp-live-probe] Run 1: claude --print … --settings <f> --mcp-config <f> --strict-mcp-config');
    const run1 = runClaudePrint([
      '--settings', settingsPath1,
      '--mcp-config', mcpConfigPath1,
      '--strict-mcp-config'
    ]);
    log(`[mcp-live-probe] Run 1 exit=${run1.status} signal=${run1.signal ?? ''} error=${run1.error ?? ''}`);
    log(`[mcp-live-probe] Run 1 stdout: ${run1.stdout.trim()}`);
    if (run1.stderr.trim()) log(`[mcp-live-probe] Run 1 stderr: ${run1.stderr.trim()}`);

    // ── Run 2: --settings ALONE, fresh marker — rules out --strict-mcp-config
    //    as the thing suppressing the settings channel (RESEARCH's run 2). ────
    const settingsMarker2 = join(scratch, 'settings-marker-2.txt');
    const settingsPath2 = join(scratch, 'settings-2.json');
    writeFileSync(settingsPath2, JSON.stringify({
      permissions: { deny: [] },
      mcpServers: { 'probe-settings-server-2': serverSpec(settingsMarker2) }
    }, null, 2));

    log('[mcp-live-probe] Run 2: claude --print … --settings <f>  (no --mcp-config, no --strict-mcp-config)');
    const run2 = runClaudePrint(['--settings', settingsPath2]);
    log(`[mcp-live-probe] Run 2 exit=${run2.status} signal=${run2.signal ?? ''} error=${run2.error ?? ''}`);
    log(`[mcp-live-probe] Run 2 stdout: ${run2.stdout.trim()}`);
    if (run2.stderr.trim()) log(`[mcp-live-probe] Run 2 stderr: ${run2.stderr.trim()}`);

    const settings1Wrote = existsSync(settingsMarker1);
    const mcpConfig1Wrote = existsSync(mcpConfigMarker1);
    const settings2Wrote = existsSync(settingsMarker2);

    log(`[mcp-live-probe] settings marker (run1) present: ${settings1Wrote}`);
    log(`[mcp-live-probe] mcp-config marker (run1) present: ${mcpConfig1Wrote}`);
    log(`[mcp-live-probe] settings marker (run2, no --mcp-config) present: ${settings2Wrote}`);

    const settingsIgnoredBothRuns = !settings1Wrote && !settings2Wrote;
    const mcpConfigSpawned = mcpConfig1Wrote;

    if (settingsIgnoredBothRuns && mcpConfigSpawned) {
      log('[mcp-live-probe] CHANNEL RE-CONFIRMED — settings ignored, mcp-config spawned.');
      exitCode = 0;
    } else if (!settingsIgnoredBothRuns) {
      log('[mcp-live-probe] CHANNEL CHANGED — the --settings mcpServers key spawned a server. '
        + 'STOP: this plan is built on it being a no-op; the design must be re-litigated, not patched.');
      exitCode = 1;
    } else if (!mcpConfigSpawned) {
      // Neither channel wrote anything at all. Distinguish "genuinely
      // inconclusive" (auth/network — claude never got anywhere) from
      // "changed" (claude ran fine but neither channel spawned a server,
      // which would itself be a channel change worth stopping on).
      const bothFailed = (run1.status !== 0 || run1.error) && (run2.status !== 0 || run2.error);
      if (bothFailed) {
        log(`[mcp-live-probe] INCONCLUSIVE — claude exited non-zero on both turns and neither `
          + `marker was written. Captured stderr above is almost certainly an authentication error.`);
        exitCode = 3;
      } else {
        log('[mcp-live-probe] CHANNEL CHANGED — claude ran but neither channel spawned a server. '
          + 'STOP and report.');
        exitCode = 1;
      }
    } else {
      exitCode = 1;
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  process.exit(exitCode);
}

main();
