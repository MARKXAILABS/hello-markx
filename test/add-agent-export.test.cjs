'use strict';

/**
 * The "export team…" affordance in AddAgentModal — SCALE-02 (plan 03-04).
 *
 * WHY THIS FILE EXISTS AND NOT test/renderer-components.test.cjs.
 * That file is owned by plan 03-07 in this same wave (it is adding a DayBandTab
 * case to it). Two plans editing one file in one wave is a merge collision, so this
 * plan's renderer coverage lands here instead, MIRRORING that file's `Module._load`
 * shim rather than importing its helpers — an independent stub setup, so neither
 * file can silently change what the other resolves.
 *
 * WHAT THIS FILE ACTUALLY PROVES, AND WHAT IT CANNOT.
 * `AddAgentModal.tsx` DOES load and DOES render under the shim below — measured, not
 * assumed. So the button's text and the D-16 lossiness sentence are asserted against
 * REAL rendered markup, not a string-presence check over the source. What
 * `renderToStaticMarkup` structurally cannot reach is anything behind a click: it
 * runs no effects and fires no events, so the export button's onClick never runs and
 * the status line it sets never renders. That is why `exportOutcomeText` is exported
 * from the component and driven directly here — the same measured reason
 * `formatRemaining` and `blockReasonFromApproval` are exported in the sibling file.
 * The one thing neither half proves is that the button's onClick is WIRED to
 * `window.cth.exportTeam()`; that wire is a source-level assertion at the bottom,
 * and it is labelled as one.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const loadTs = require('./load-ts.cjs');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src/renderer/src/components/AddAgentModal.tsx');

/** `@/x` → the repo-relative path `loadTs` wants. Same candidate order as resolveTs. */
function resolveAlias(request) {
  const base = path.join('src/renderer/src', request.slice(2));
  for (const candidate of [`${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]) {
    if (fs.existsSync(path.join(ROOT, candidate))) return candidate;
  }
  return null;
}

// `self` — @xterm/addon-fit's UMD header evaluates it at module scope, and this
// component reaches it through the store. `.css` — Node would try to parse it as JS.
// `react`/`react-dom` are passed THROUGH to the real modules on purpose: proxying
// them renders a Proxy, and every assertion below would pass against nothing.
const origLoad = Module._load;
globalThis.self = globalThis;
Module._load = function (request, ...rest) {
  if (request.endsWith('.css')) return {};
  if (request.startsWith('@/')) {
    const hit = resolveAlias(request);
    if (hit) return loadTs(hit);
  }
  return origLoad.call(this, request, ...rest);
};

/** The preload bridge. Only `getConfig` is reachable during a server render (and
 *  only if an effect ran, which none do) — the rest exist so a missing key is a
 *  test failure here rather than a TypeError in the app. */
globalThis.window = globalThis.window ?? {};
globalThis.window.cth = {
  getConfig: () => Promise.resolve({ claudeAccounts: [] }),
  exportTeam: () => Promise.resolve({ ok: true, members: 0, skipped: 0 }),
  importHireFile: () => Promise.resolve({ ok: false, error: 'cancelled' })
};

const { AddAgentModal, exportOutcomeText } = loadTs('src/renderer/src/components/AddAgentModal.tsx');

/** Enough HarnessConfig for a first render. `registeredRepos` is not optional —
 *  the component reads `config.registeredRepos[0]` in a useState initializer. */
const CONFIG = {
  defaultCommand: 'claude',
  defaultProvider: 'claude',
  harnessHome: 'C:/home',
  registeredRepos: [],
  projects: [],
  claudeAccounts: []
};

function render() {
  return renderToStaticMarkup(
    React.createElement(AddAgentModal, { onClose: () => {}, config: CONFIG })
  );
}

// ─── the real render ────────────────────────────────────────────────────────

test('AddAgentModal renders — and this file is not silently asserting against an empty string', () => {
  const html = render();
  assert.ok(html.length > 1000, `the render produced ${html.length} chars; it did not render`);
  // A control that is definitely there today. If this ever goes red the harness
  // broke, not the export button.
  //
  // The literal was `import hire` until plan 03-06 relabelled the button to
  // `import…` (UI-SPEC:944 / D-17): the same channel now accepts a team file too,
  // so a label naming only "hire" was false. Updated to the current contract
  // rather than deleted — this assertion's job is to prove the render is real.
  assert.ok(html.includes('import…'), 'the existing import button is missing — the harness, not this feature');
});

test('the export button is IN THE RENDERED MARKUP, next to import', () => {
  const html = render();
  assert.ok(html.includes('export team'), 'the "export team…" button did not render');

  // S3b: immediately LEFT of import, so the two file actions read as a pair.
  const exportAt = html.indexOf('export team');
  const importAt = html.indexOf('import…');
  // Both halves pinned: a -1 from a renamed label would otherwise satisfy
  // `exportAt < importAt` by accident and this ordering check would go vacuous.
  assert.notEqual(importAt, -1, 'the import button did not render');
  assert.ok(exportAt < importAt, `export (${exportAt}) must render before import (${importAt})`);
});

test('A1: the export button has an accessible name — its own visible text', () => {
  const html = render();
  // The repo's rule: visible text IS the accessible name; an icon-only control
  // would need aria-label, and this one deliberately is not icon-only.
  assert.ok(/>\s*export team/.test(html), 'the button text is not a text node in the markup');
});

test('D-16: the lossiness declaration renders, verbatim from UI-SPEC S3b', () => {
  const html = render();
  assert.ok(
    html.includes('A team file carries names, engines, models and goals.'),
    'the first half of the lossiness sentence is missing'
  );
  assert.ok(
    html.includes('Folders, accounts and command flags stay on this machine.'),
    'the second half — the half that names what is NOT carried — is missing'
  );
});

test('the lossiness sentence renders BELOW the buttons, not somewhere else on the sheet', () => {
  const html = render();
  assert.notEqual(html.indexOf('import…'), -1, 'the import button did not render');
  assert.ok(html.indexOf('export team') < html.indexOf('A team file carries names'));
  assert.ok(html.indexOf('import…') < html.indexOf('A team file carries names'));
});

// ─── the outcome copy (unreachable through a render; driven directly) ────────

test('a zero-member export is NOT silent', () => {
  assert.deepEqual(
    exportOutcomeText({ ok: true, members: 0, skipped: 0 }),
    { notice: 'no agents to export' }
  );
});

test('a skipped member is named and COUNTED, never dropped quietly', () => {
  const out = exportOutcomeText({ ok: true, members: 4, skipped: 1 });
  assert.equal(out.error, undefined, 'a partial export is not an error banner');
  assert.ok(out.notice.includes('4 agents'), out.notice);
  assert.ok(out.notice.includes('1 agent'), `the skipped count must appear: ${out.notice}`);
  assert.ok(out.notice.includes('left out'), out.notice);
});

test('members:0 with skipped:2 is distinguishable from a genuinely empty floor', () => {
  const empty = exportOutcomeText({ ok: true, members: 0, skipped: 0 });
  const allSkipped = exportOutcomeText({ ok: true, members: 0, skipped: 2 });
  assert.notEqual(empty.notice, allSkipped.notice, 'both outcomes produced the same copy');
  assert.ok(allSkipped.notice.includes('2 agents'), allSkipped.notice);
  assert.ok(allSkipped.notice.includes('left out'), allSkipped.notice);
});

test('a clean export says how many, with the singular right', () => {
  assert.deepEqual(exportOutcomeText({ ok: true, members: 1, skipped: 0 }), { notice: 'Exported 1 agent.' });
  assert.deepEqual(exportOutcomeText({ ok: true, members: 7, skipped: 0 }), { notice: 'Exported 7 agents.' });
});

test('an absent or unreadable roster surfaces as an ERROR, not as a successful empty export', () => {
  const out = exportOutcomeText({ ok: false, error: 'no roster to export' });
  assert.equal(out.error, 'no roster to export');
  assert.equal(out.notice, undefined, 'this must not also read as a success');
});

test('cancelling the save dialog says nothing at all', () => {
  assert.deepEqual(exportOutcomeText({ ok: false, error: 'cancelled' }), {});
  assert.deepEqual(exportOutcomeText({ ok: false }), {});
});

test('a write failure surfaces its error', () => {
  assert.deepEqual(exportOutcomeText({ ok: false, error: 'EACCES: permission denied' }),
    { error: 'EACCES: permission denied' });
});

test('missing counts are treated as zero rather than rendering "undefined agents"', () => {
  const out = exportOutcomeText({ ok: true });
  assert.equal(out.notice, 'no agents to export');
  assert.equal(String(out.notice).includes('undefined'), false);
});

// ─── the one wire a server render cannot see ────────────────────────────────

test('SOURCE-LEVEL (stated as such): the button is wired to window.cth.exportTeam()', () => {
  // renderToStaticMarkup fires no events, so no assertion above can prove this
  // handler is attached to that button. This is a string check over the source and
  // does NOT prove the wire survives a refactor that renames the handler.
  const src = fs.readFileSync(SRC, 'utf8');
  assert.ok(src.includes('window.cth.exportTeam()'), 'the export IPC call is missing');
  assert.match(src, /onClick=\{exportTeam\}/, 'no button is wired to the exportTeam handler');
  assert.ok(src.includes('exportOutcomeText(await window.cth.exportTeam())'),
    'the handler no longer routes its result through the tested copy function');
});

test('OWNERSHIP: this plan does not touch test/renderer-components.test.cjs (03-07 owns it this wave)', () => {
  // A file-level guard, not a git one: the git-log pin is in the plan's acceptance
  // criteria. This asserts the sibling file still exists and is not something this
  // file reaches into.
  assert.ok(fs.existsSync(path.join(ROOT, 'test/renderer-components.test.cjs')));
  const self = fs.readFileSync(__filename, 'utf8');
  // Built at run time so this assertion does not match its own source text.
  const sibling = './renderer-' + 'components';
  assert.equal(self.includes(`require('${sibling}`), false,
    'this file must set up its own shim, not import the sibling suite');
});
