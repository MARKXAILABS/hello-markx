#!/usr/bin/env node
'use strict';
/**
 * Windows-only node-pty crash guard, re-applied on every install (postinstall,
 * after electron-rebuild). No-op on non-Windows and when already patched.
 *
 * node-pty forks `conpty_console_list_agent.js` to enumerate console processes
 * when a pty is killed/exits. For a child whose console is already gone — e.g.
 * an agent CLI that manages its own console and exits fast (Antigravity's `agy`)
 * — `getConsoleProcessList(shellPid)` throws "AttachConsole failed" UNCAUGHT in
 * that forked helper, which cascades into a whole-app crash (exit 255). Wrap it
 * so it degrades to an empty list instead.
 */
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

if (process.platform !== 'win32') process.exit(0);

const agent = join(__dirname, '..', 'node_modules', 'node-pty', 'lib', 'conpty_console_list_agent.js');
if (!existsSync(agent)) process.exit(0);

const src = readFileSync(agent, 'utf8');
const MARKER = 'var consoleProcessList = getConsoleProcessList(shellPid);';
const APPLIED = 'PATCHED: AttachConsole can fail';

// Idempotent: our own patch consumes the marker, so an already-guarded file is a
// success and not a miss.
if (src.includes(APPLIED)) process.exit(0);

// Marker gone AND not ours => node-pty rewrote the line and this guard silently
// did nothing. Fail the install loudly instead: exiting 0 here used to ship a
// Windows build that takes the whole app down (exit 255) the first time an agent
// CLI exits with its console already gone, which is exactly the crash this file
// exists to prevent. node-pty is pinned EXACTLY in package.json (#43) precisely
// because the match below is byte-exact, so this can only fire on a deliberate
// bump — at which point a human needs to re-derive the patch.
if (!src.includes(MARKER)) {
  const version = require(join(__dirname, '..', 'node_modules', 'node-pty', 'package.json')).version;
  console.error(
    `[patch-node-pty-conpty] node-pty ${version} no longer contains the expected line\n` +
      `    ${MARKER}\n` +
      `  in ${agent}\n` +
      '  The conpty AttachConsole crash guard was NOT applied, so a Windows build from\n' +
      '  this tree can crash the whole app (exit 255) when an agent CLI exits with its\n' +
      '  console already gone. Re-derive the patch against the new node-pty source, or\n' +
      '  pin node-pty back, before shipping Windows.'
  );
  process.exit(1);
}

const guarded =
  'var consoleProcessList = [];\n' +
  '// PATCHED: AttachConsole can fail when the shell console is already gone (e.g.\n' +
  "// a fast-exiting agent CLI that owns its console). Don't let the uncaught throw\n" +
  '// crash this forked helper and cascade into a whole-app crash.\n' +
  'try { consoleProcessList = getConsoleProcessList(shellPid); } catch (e) { consoleProcessList = []; }';

let out = src.replace(MARKER, guarded);
out = out.replace(
  'process.send({ consoleProcessList: consoleProcessList });',
  'try { process.send({ consoleProcessList: consoleProcessList }); } catch (e) { /* parent gone */ }'
);
if (out !== src) {
  writeFileSync(agent, out, 'utf8');
  console.log('[patch-node-pty-conpty] guarded conpty_console_list_agent against AttachConsole crash');
}
