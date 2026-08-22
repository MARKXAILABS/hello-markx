'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const root = path.join(__dirname, '..');
/** Same idiom as test/ci-config.test.cjs — the in-repo precedent for pinning two
 *  files to each other. */
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const { patchChangesAgent, touchesDurableAgentField } =
  loadTs('src/renderer/src/store/agentPatch.ts');
const { terminalsToEvict, orphanedTerminalIds, TERMINAL_POOL_MAX } =
  loadTs('src/renderer/src/store/terminalPoolPolicy.ts');
const { isAutoModeAgent, agentRowForCard, getLiveAutoMode, setLiveAutoMode, subscribeLiveAutoMode } =
  loadTs('src/renderer/src/store/autoMode.ts');
const { autoModeFlagForProvider, AGENT_PROVIDER_PRESETS } = loadTs('src/shared/agentProvider.ts');
const { sidebarLayout, SIDEBAR_COLLAPSE_WIDTH, SIDEBAR_OVERLAY_GUTTER, splitterReachableMax, SPLITTER_REACHABLE_RESERVE } =
  loadTs('src/renderer/src/store/sidebarLayout.ts');

const agent = () => ({
  id: 'dev1',
  name: 'Jim',
  status: 'working',
  action: 'bash npm test',
  description: 'ships the parser',
  currentStation: 'terminal',
  carrying: 'Bash',
  progress: 0
});

// ── a PTY chunk must not reallocate the agent list ─────────────────────────
test('re-asserting the run-state a chunk already reported is a no-op', () => {
  // The pty parser's streaming-prose write, dozens of times a second.
  assert.equal(patchChangesAgent(agent(), { status: 'working' }), false);
  // Its tool-line write, when the same tool line is still the last one seen.
  assert.equal(
    patchChangesAgent(agent(), {
      status: 'working', action: 'bash npm test', currentStation: 'terminal', carrying: 'Bash'
    }),
    false
  );
});

test('a field that actually moved still notifies', () => {
  assert.equal(patchChangesAgent(agent(), { status: 'idle' }), true);
  assert.equal(patchChangesAgent(agent(), { action: 'read spec.md' }), true);
  // Clearing a set field is a change; clearing an already-empty one is not.
  assert.equal(patchChangesAgent(agent(), { carrying: undefined }), true);
  assert.equal(patchChangesAgent({ ...agent(), carrying: undefined }, { carrying: undefined }), false);
});

test('run-state is volatile; everything else still persists', () => {
  assert.equal(touchesDurableAgentField({ status: 'idle', action: 'awaiting' }), false);
  assert.equal(touchesDurableAgentField({ contextTokens: 12, progress: 3 }), false);
  // `description` is the agent's role, not its current action — a write to it
  // rewrites localStorage and the roster file.
  assert.equal(touchesDurableAgentField({ description: 'bash npm test' }), true);
  assert.equal(touchesDurableAgentField({ model: 'claude-opus-5' }), true);
});

// ── the pool evicts at its cap ─────────────────────────────────────────────
const pooled = (ptyId, lastUsedAt, attached = false) => ({ ptyId, lastUsedAt, attached });

test('under the cap the pool evicts nothing', () => {
  const entries = [pooled('a', 1), pooled('b', 2), pooled('c', 3)];
  assert.deepEqual(terminalsToEvict(entries, 3), []);
  assert.deepEqual(terminalsToEvict(entries, TERMINAL_POOL_MAX), []);
});

test('over the cap the least recently acquired detached terminals go', () => {
  const entries = [pooled('new', 50), pooled('old', 1), pooled('mid', 20), pooled('older', 0)];
  assert.deepEqual(terminalsToEvict(entries, 2, 'new'), ['older', 'old']);
});

test('an attached terminal is never evicted, nor the one just acquired', () => {
  // 'onscreen' is the oldest by far, but a view is showing it.
  const entries = [pooled('onscreen', 0, true), pooled('fresh', 99), pooled('cold', 10)];
  assert.deepEqual(terminalsToEvict(entries, 2, 'fresh'), ['cold']);
  // Nothing eligible → nothing evicted, rather than blanking a live pane.
  assert.deepEqual(terminalsToEvict([pooled('onscreen', 0, true), pooled('fresh', 99)], 1, 'fresh'), []);
});

// ── dropping an agent disposes its terminal, on BOTH paths ─────────────────
test('a terminal whose agent left the roster is an orphan', () => {
  const entries = [pooled('pty-god', 5), pooled('pty-dev1', 6), pooled('pty-dev2', 7)];
  // Path 1 — the archive broadcast: dev1 was archived, so it is off the roster.
  assert.deepEqual(orphanedTerminalIds(entries, ['pty-god', 'pty-dev2']), ['pty-dev1']);
  // Path 2 — reconcileWithLivePtys at startup: both workers died with the last
  // session and only god's pty came back.
  assert.deepEqual(orphanedTerminalIds(entries, ['pty-god']), ['pty-dev1', 'pty-dev2']);
});

test('a live roster orphans nothing, and an attached terminal is left alone', () => {
  const entries = [pooled('pty-god', 5), pooled('pty-dev1', 6)];
  assert.deepEqual(orphanedTerminalIds(entries, ['pty-god', 'pty-dev1']), []);
  // Restart & Continue kills and respawns under the SAME id: the agent never
  // leaves the roster, so its terminal is never a candidate.
  assert.deepEqual(orphanedTerminalIds([pooled('pty-dev1', 6, true)], []), []);
});

// ── FLOOR-01: auto mode is derived once, from the agent's own command ───────
//
// The chip is a SAFETY indicator: it tells the operator this agent acts without
// asking for tool approval. Both lying directions are graded here.

/** Exactly how store/config.ts's buildSpawnCommand builds it: base + ' ' + flag. */
const spawned = (base, provider) => {
  const flag = autoModeFlagForProvider(provider);
  return flag ? `${base} ${flag}` : base;
};

test('a claude agent whose command carries the auto flag is bypassed', () => {
  const cmd = spawned('claude', 'claude');
  // Positive control on the fixture itself: if the preset ever stops supplying a
  // flag, the assertion below would pass on a bare command and mean nothing.
  assert.notEqual(cmd, 'claude', 'claude preset must still carry an auto flag');
  assert.equal(isAutoModeAgent('claude', cmd, false), true);
});

test('the same provider without the flag is not bypassed', () => {
  assert.equal(isAutoModeAgent('claude', 'claude', false), false);
  // And not even with the global toggle on: the flag was never spliced on, so
  // this agent asks before every tool call whatever Settings says today.
  assert.equal(isAutoModeAgent('claude', 'claude', true), false);
  // A near-miss flag value is not the bypass flag.
  assert.equal(isAutoModeAgent('claude', 'claude --permission-mode acceptEdits', true), false);
});

test('an opencode agent follows the live toggle - its bypass is env-based', () => {
  // opencode's TUI exposes no skip-permissions flag, so nothing lands on the
  // command string; main writes permission:allow into OPENCODE_CONFIG_CONTENT.
  assert.equal(autoModeFlagForProvider('opencode'), '');
  assert.equal(isAutoModeAgent('opencode', 'opencode', true), true);
  assert.equal(isAutoModeAgent('opencode', 'opencode', false), false);
});

test('a custom agent shows AUTO when the OPERATOR typed a bypass flag, and only then', () => {
  // custom has no auto flag of its own AND no env route, so the FLOOR never
  // bypasses it. That is not the question FLOOR-01 asks. `config.ts`'s
  // buildSpawnCommand spawns the operator's free-text command VERBATIM, so a
  // bypass flag the operator typed is a bypass the PTY is really running - and
  // the module's own docstring calls a missing chip on a bypassed agent "the
  // worst failure this chip can have". The floor cannot GRANT the bypass here;
  // it can still READ it.
  assert.equal(autoModeFlagForProvider('custom'), '');
  assert.equal(isAutoModeAgent('custom', 'my-agent --yolo --dangerously-skip-permissions', true), true);
  // No flag, no chip - even with the floor's global toggle on. Also the
  // empty-flag trap: two presets carry `autoFlag: ''`, and a matcher that treats
  // "no flag tokens" as "all flag tokens present" paints AUTO on everything.
  assert.equal(isAutoModeAgent('custom', '', true), false);
});

// The whole derivation, as one table. The chip is a SAFETY indicator, so both
// directions are pinned: a bypass it must not miss, and a bypass it must not
// invent out of a substring.
test('the AUTO chip matches whole argv tokens, on both sides of an `=`', () => {
  const rows = [
    // [provider, command, liveAutoMode, expected, why]
    ['custom', 'my-agent --yolo --dangerously-skip-permissions', true, true,
      'a custom agent carrying two real bypass flags shows no chip'],
    ['custom', 'claude --dangerously-skip-permissions', false, true,
      'the floor toggle is irrelevant - the command string is what the PTY runs'],
    ['custom', 'mytool --dangerously-skip-permissions=true', false, true,
      'the `=`-joined form of a real bypass flag is missed'],
    ['claude', 'claude --permission-mode=bypassPermissions', false, true,
      'the `=`-joined form of a MULTI-token flag is missed'],
    ['kimi', 'kimi --model x --auto-compact', false, false,
      '`--auto-compact` painted a bypass because `--auto` is a PREFIX of it'],
    ['custom', 'my-agent', true, false, 'no flag, no chip'],
    ['kimi', 'kimi --auto', false, true, 'the real flag stopped matching'],
    ['claude', 'claude --permission-mode bypassPermissions', false, true,
      'the space-separated multi-token flag stopped matching'],
    ['copilot', 'copilot -s --allow-all-tools --no-ask-user', false, true,
      "Copilot's three-token flag stopped matching"],
    ['opencode', 'opencode', true, true, 'the untouched env-based arm moved'],
    // Deliberate over-report, pinned so it is a DECISION and not an accident:
    // `--auto` is Kimi's bypass flag, so an unrelated binary using `--auto` to
    // mean "non-interactive" gets the chip. Over-reporting is a cosmetic false
    // alarm; under-reporting on a real bypass is a safety failure. Narrowing it
    // needs a per-preset "is this flag ambiguous" annotation on the shared
    // module, which is outside this gap set.
    ['custom', 'mytool --auto', false, true, 'the deliberate over-report changed silently']
  ];
  for (const [provider, command, live, expected, why] of rows) {
    assert.equal(isAutoModeAgent(provider, command, live), expected,
      `isAutoModeAgent('${provider}', '${command}', ${live}) !== ${expected} — ${why}`);
  }
});

test('every preset agrees with itself: autoFlag === autoModeFlag', () => {
  // REGRESSION GUARD, green before this plan and after it. `buildSpawnCommand`
  // WRITES `autoFlag`; `autoModeFlagForProvider` READS `autoModeFlag`. All
  // eleven presets set both to the same string, so the predicate is correct by
  // COINCIDENCE. This is what makes breaking the coincidence loud. Repointing
  // the reader is a shared-module change, outside this gap set.
  assert.ok(AGENT_PROVIDER_PRESETS.length >= 11, 'the preset list shrank');
  for (const preset of AGENT_PROVIDER_PRESETS) {
    assert.equal(preset.autoFlag ?? '', preset.autoModeFlag ?? '',
      `preset '${preset.id}' writes '${preset.autoFlag}' at spawn but the chip reads '${preset.autoModeFlag}' — the AUTO chip now disagrees with what the PTY was given`);
  }
});

test('turning the toggle OFF does not de-bypass an already-running agent', () => {
  // The flag is baked at spawn. This is the direction a chip driven off
  // config.autoMode lies in, and the whole reason the derivation is the command.
  const cmd = spawned('claude', 'claude');
  assert.equal(isAutoModeAgent('claude', cmd, true), true);
  assert.equal(isAutoModeAgent('claude', cmd, false), true);
  // ...and the other direction: turning it ON does not bypass one already up.
  assert.equal(isAutoModeAgent('codex', 'codex', true), false);
  assert.equal(isAutoModeAgent('codex', spawned('codex', 'codex'), false), true);
});

test('the agent card resolves its own store row, and fails safe when it cannot', () => {
  const rows = [
    { ptyId: 'pty-god', name: 'Michael' },
    { ptyId: 'pty-dev1', name: 'Jim' },
    { name: 'Pam' },              // restored, no live PTY
    { name: 'Dwight' },
    { name: 'Dwight' }            // duplicate name - ambiguous
  ];
  assert.equal(agentRowForCard(rows, 'pty-dev1', 'Jim'), rows[1]);
  // No PTY: the unique name is the only key the card is handed.
  assert.equal(agentRowForCard(rows, undefined, 'Pam'), rows[2]);
  // Ambiguous name resolves to nothing rather than to the wrong agent's bypass.
  assert.equal(agentRowForCard(rows, undefined, 'Dwight'), undefined);
  assert.equal(agentRowForCard(rows, 'pty-gone', 'Jim'), undefined);
});

test('the live toggle is published once and every reader is notified', () => {
  const seen = [];
  const off = subscribeLiveAutoMode(() => seen.push(getLiveAutoMode()));
  setLiveAutoMode(true);
  setLiveAutoMode(true);   // no-op: a redundant publish must not churn readers
  setLiveAutoMode(false);
  off();
  setLiveAutoMode(true);   // after unsubscribe: no further notification
  assert.deepEqual(seen, [true, false]);
  setLiveAutoMode(false);  // leave the singleton where the other tests expect it
});

// ── FLOOR-13: the sidebar collapses below 1024 ──────────────────────────────
//
// DESIGN.md:677 promised this and no code ran it. The boundary is a measured
// width comparison, never a CSS breakpoint - these assertions are the reason it
// can stay one.

test('above the boundary nothing changes: no collapse, no toggle, splitter stays', () => {
  const wide = sidebarLayout(1200, 420, false);
  assert.equal(wide.collapsed, false);
  assert.equal(wide.showToggle, false, 'the toggle is not in the tree above 1024');
  assert.equal(wide.showSplitter, true);
  assert.equal(wide.showOverlay, false);
  // Exactly at the boundary is still the wide layout - 1024 is the floor of the
  // desktop range, not the first collapsed pixel.
  assert.equal(sidebarLayout(SIDEBAR_COLLAPSE_WIDTH, 420, false).collapsed, false);
});

test('one pixel below the boundary it collapses and the toggle appears', () => {
  const narrow = sidebarLayout(1023, 420, false);
  assert.equal(narrow.collapsed, true);
  assert.equal(narrow.showToggle, true);
  assert.equal(narrow.showSplitter, false, 'nothing to drag while it is an overlay');
  // Closed by default: a narrow window opens on a full-width floor.
  assert.equal(narrow.showOverlay, false);
  assert.equal(sidebarLayout(1023, 420, true).showOverlay, true);
});

test('the overlay never covers the whole canvas - it is capped at vpWidth - 48', () => {
  // A 900px sidebar in an 800px window would be wider than the window itself.
  assert.equal(sidebarLayout(800, 900, true).overlayWidth, 800 - SIDEBAR_OVERLAY_GUTTER);
  assert.equal(SIDEBAR_OVERLAY_GUTTER, 48);
  // Under the cap the user's own width is honoured unchanged.
  assert.equal(sidebarLayout(1000, 420, true).overlayWidth, 420);
  // Degenerate window: a negative width would be an invalid CSS length.
  assert.equal(sidebarLayout(20, 420, true).overlayWidth, 0);
});

test('crossing the boundary in both directions never mutates the stored width', () => {
  // The bug this guards: writing the overlay's computed width back through
  // setSidebarWidth strands the user's chosen width on the next large-window
  // boot - the exact class SidebarSplitter's resize useEffect was written to
  // kill.
  const stored = { sidebarWidth: 900 };
  const seen = [];
  for (const vp of [1400, 800, 1400, 600, 1400]) {
    seen.push(sidebarLayout(vp, stored.sidebarWidth, true).overlayWidth);
  }
  assert.equal(stored.sidebarWidth, 900, 'the persisted width is untouched');
  // ...and the narrow-window value really WAS different, so "unchanged" is a
  // result rather than a coincidence.
  assert.deepEqual(seen, [900, 752, 900, 552, 900]);
});

// ── the window floor, the collapse breakpoint and the design doc, pinned ─────
//
// Three constants in two processes and one document describe ONE shipped
// behaviour, and nothing tied them together: `MIN_WIN.width` in src/main/index.ts
// was 1280 while SIDEBAR_COLLAPSE_WIDTH here is 1024, so the collapsed layout
// below 1024 was built, tested and documented — and UNREACHABLE, because the
// operator could not drag the window narrow enough to see it. DESIGN.md kept
// promising it in two places the whole time.
//
// CEILING, stated so nobody mistakes this for a robust coupling: this is a
// RENDERER test parsing a MAIN-PROCESS source file. Renaming `MIN_WIN`, inlining
// it, or moving it to src/shared/ makes this test fail with a message about the
// sidebar. That is the price of coupling two processes through text. The durable
// fix is ONE exported constant both processes import, which is a cross-process
// refactor outside this gap set. The mitigation is that every extraction below
// asserts it MATCHED before comparing — a broken regex and a compliant tree must
// never be indistinguishable — and the failure message names all three sites.

/** The `MIN_WIN` object literal, parsed out of source TEXT.
 *
 *  A pure function of a string, deliberately: it takes the working tree in the
 *  live assertion and an inline fixture in the RED demonstration below, so the
 *  demonstration needs no subprocess, no git object and no file written. It is
 *  bounded by the declaration itself as a structural delimiter — never by a line
 *  number, because the line numbers in this phase move every wave. */
function minWinFromSource(src) {
  const decl = /const\s+MIN_WIN\s*=\s*\{([^}]*)\}/.exec(src);
  assert.ok(decl, 'no `const MIN_WIN = { ... }` declaration found — the extractor matched nothing, which is NOT the same as the tree being compliant. If MIN_WIN was renamed or moved, this test must move with it (src/main/index.ts).');
  const width = /width:\s*(\d+)/.exec(decl[1]);
  const height = /height:\s*(\d+)/.exec(decl[1]);
  assert.ok(width && height, `MIN_WIN's body has no numeric width/height: ${decl[1]}`);
  return { width: Number(width[1]), height: Number(height[1]) };
}
const minWinWidthFromSource = (src) => minWinFromSource(src).width;
const minWinHeightFromSource = (src) => minWinFromSource(src).height;

/** Every `NNN × NNN` pair DESIGN.md states as the window minimum, with its line
 *  number. Two sentences say it (the Layout section and the responsive section)
 *  and they have to agree with each other as well as with the code. */
function designMinWindows(src) {
  const out = [];
  src.split(/\r?\n/).forEach((line, i) => {
    if (!/min(imum)?\s+window|window\s+minimum/i.test(line)) return;
    const pair = /(\d+)\s*[×x]\s*(\d+)/.exec(line);
    if (pair) out.push([i + 1, Number(pair[1]), Number(pair[2])]);
  });
  return out;
}

/** The declaration src/main/index.ts carried before plan 01-25 lowered it. This
 *  is the RED demonstration's input: the extractor has been SEEN returning 1280
 *  and clause 1 has been SEEN failing, with nothing spawned and nothing written.
 *  (A `git show` of the pre-fix blob cannot work in CI — every checkout in
 *  .github/workflows/ci.yml is a depth-1 clone, so the object is not there, and
 *  the case would redden the hard `test` gate on all three runners forever.) */
const PRE_FIX_MIN_WIN_SOURCE = `
  // The floor below which the layout stops composing.
  const MIN_WIN = { width: 1280, height: 800 };
  const DEFAULT_WIN = { width: 1440, height: 900 };
`;

test('the window minimum sits BELOW the collapse breakpoint, in the doc and in main', () => {
  const mainSrc = read('src/main/index.ts');
  const minWin = minWinFromSource(mainSrc);
  const why = `src/main/index.ts's MIN_WIN.width (${minWin.width}) vs sidebarLayout.ts's SIDEBAR_COLLAPSE_WIDTH (${SIDEBAR_COLLAPSE_WIDTH}) vs DESIGN.md's two stated minimums`;

  // Clause 1 — THE ACCEPTANCE GATE. A minimum at or above the breakpoint makes
  // the collapsed branch unreachable in the shipped app: every test below still
  // passes, and no operator can ever see the layout they cover.
  assert.ok(minWinWidthFromSource(mainSrc) < SIDEBAR_COLLAPSE_WIDTH,
    `the window cannot be made narrow enough to reach the sidebar collapse — ${why}. The collapsed branch is dead code in the shipped app while four tests here keep it green.`);

  // Clause 2 — REGRESSION GUARD, already true before this plan. Without it the
  // cheapest wrong implementation passes clause 1 and changes nothing:
  // `MIN_WIN.width = 960` with `minWidth: 1280` hardcoded in the BrowserWindow
  // options. The constant would be right and the window would still refuse to
  // move. Its green tick is NOT evidence that this phase changed something.
  const hardcoded = mainSrc.match(/min(Width|Height):\s*\d/g) ?? [];
  assert.deepEqual(hardcoded, [],
    `the BrowserWindow options hardcode a numeric minimum instead of consuming MIN_WIN (${hardcoded.join(', ')}) — the constant is then decorative and this pin proves nothing`);

  // Clause 3 — the drift guard. Green in both states by design: it is what stops
  // the NEXT person moving one of the three without the other two.
  const stated = designMinWindows(read('DESIGN.md'));
  assert.equal(stated.length, 2,
    `DESIGN.md states the window minimum ${stated.length} times, expected 2 (found: ${JSON.stringify(stated)}) — a reworded sentence must fail loudly here rather than let this clause pass vacuously`);
  for (const [line, w, h] of stated) {
    assert.deepEqual([w, h], [minWin.width, minWin.height],
      `DESIGN.md:${line} promises a ${w} × ${h} minimum window and src/main/index.ts enforces ${minWin.width} × ${minWin.height} — ${why}`);
  }
});

test('the pin has been SEEN failing: the same extractor, against the pre-fix declaration', () => {
  // The RED demonstration, as a permanent test case rather than a narrated
  // claim. Nothing spawned, no git object read, no network, no working-tree
  // file written — src/main/index.ts is not this plan's file and is never
  // touched. (The literal names of Node's process-spawning APIs are deliberately
  // absent from this file: the gate that keeps this demonstration honest is a
  // substring search for them, so even naming them in prose would defeat it.)
  assert.equal(minWinWidthFromSource(PRE_FIX_MIN_WIN_SOURCE), 1280,
    'the extractor cannot read the declaration the tree actually shipped before plan 01-25 — a pin that only parses the compliant form is a pin that has never been seen failing');
  assert.equal(minWinHeightFromSource(PRE_FIX_MIN_WIN_SOURCE), 800);

  // ...and clause 1 really does fail on it. This is the assertion that makes the
  // gate above an acceptance gate rather than a tautology.
  assert.equal(minWinWidthFromSource(PRE_FIX_MIN_WIN_SOURCE) < SIDEBAR_COLLAPSE_WIDTH, false,
    'clause 1 PASSES against the pre-fix 1280 declaration, so it cannot be what detected the drift');
  assert.ok(minWinWidthFromSource(read('src/main/index.ts')) < minWinWidthFromSource(PRE_FIX_MIN_WIN_SOURCE),
    'the working tree is not narrower than the pre-fix declaration — either plan 01-25 was reverted or the fixture no longer represents the old state');
});

// ── the 1024-1279 band a 960px floor opens must not eat the sidebar width ────

test('a window resize never persists a shrunken sidebar across the newly reachable band', () => {
  // `SidebarSplitter`'s resize effect calls `onChange`, which is App's
  // `setSidebarWidth`, which WRITES localStorage (store.ts). So every re-clamp on
  // a window resize is a permanent rewrite of a preference the operator chose.
  //
  // At a 1280 floor the narrowest reachable viewport left clampMax >= 920, so a
  // typical 900px sidebar was never touched. A 960 floor makes 1024-1279
  // reachable WITH THE SPLITTER STILL MOUNTED (sidebarLayout's docked branch
  // gates showSplitter on >= 1024), where clampMax is 664-919: dragging the
  // window to 1024 once rewrites a 900px sidebar to 664, and the next boot on a
  // 27" monitor opens at 664.
  //
  // A model of the effect - `if (width > bound) persist(bound)` - evaluated
  // independently at each viewport in the band.
  const writesFor = (bound, stored) => {
    const out = [];
    for (let vp = SIDEBAR_COLLAPSE_WIDTH; vp <= 1279; vp++) {
      const b = bound(vp);
      if (stored > b) out.push([vp, b]);
    }
    return out;
  };
  /** Today's drag clamp, as SidebarSplitter computes it. */
  const dragClamp = (vp) => Math.min(1200, Math.max(320, vp - 360));
  const reachable = (vp) => splitterReachableMax(vp, 320);

  const before = writesFor(dragClamp, 900);
  assert.ok(before.length > 0,
    'the drag clamp performs no persisting writes across 1024-1279 for a stored 900px sidebar, so there was never a bug to fix and this test is measuring the wrong formula');
  assert.deepEqual(before.slice(0, 2), [[1024, 664], [1025, 665]],
    'the drag clamp no longer produces the measured 664/665 at the bottom of the band');

  const after = writesFor(reachable, 900);
  assert.deepEqual(after, [],
    `a window resize still rewrites and PERSISTS a 900px sidebar at ${after.length} viewports in the 1024-1279 band (first: ${JSON.stringify(after[0])}) — the exact bug class SidebarSplitter's resize comment says it was written to kill`);

  // NEGATIVE CONTROL - issue #38 must still be fixed. A width genuinely wider
  // than the viewport still gets rescued, or the handle sits past the right edge
  // with no way to drag it back.
  assert.equal(splitterReachableMax(1024, 320), 976);
  assert.deepEqual(writesFor(reachable, 1100).slice(0, 1), [[1024, 976]],
    'a stored 1100px sidebar is no longer rescued at a 1024px viewport — the handle is now unreachable, which is issue #38 reopened');

  // NEGATIVE CONTROL - the two bounds are different numbers ON PURPOSE. "leave
  // the floor 360px" is a layout preference and is correct to enforce while the
  // operator DRAGS; "the handle must not sit past the right edge" is the only
  // invariant a resize may enforce, because a resize writes to disk.
  assert.equal(dragClamp(1024), 664);
  assert.equal(SPLITTER_REACHABLE_RESERVE, SIDEBAR_OVERLAY_GUTTER,
    'the splitter reserve and the overlay gutter have drifted apart — they are one decision (keep a strip of canvas reachable), not two magic numbers');
  // A degenerate viewport (narrower than min + the reserve) must still return a
  // usable bound rather than a value the store would have to rescue.
  assert.equal(splitterReachableMax(300, 320), 320, 'the reachability bound must never fall below `min`');
  assert.equal(splitterReachableMax(400, 320), 352, 'the bound is viewportWidth - 48 wherever that clears `min`');

  // The drag path is asserted STRUCTURALLY - SidebarSplitter is a .tsx and this
  // file is a pure node test with no DOM. Weaker than a behavioural assertion,
  // and labelled as such.
  const splitter = read('src/renderer/src/components/SidebarSplitter.tsx');
  assert.match(splitter, /const clampMax = Math\.min\(max, Math\.max\(min, viewportWidth - 360\)\)/,
    "the drag clamp's 360px floor reserve is gone — the operator can now drag the sidebar over the whole canvas");
  assert.match(splitter, /Math\.min\(clampMax, Math\.max\(min, startRef\.current\.width \+ delta\)\)/,
    'the drag handler no longer clamps to clampMax — the two bounds have been collapsed back into one');
  assert.match(splitter, /if \(width > reachableMax\) onChange\(reachableMax\)/,
    'the resize effect does not use the reachability bound — a resize is once again allowed to persist a layout preference');
});
