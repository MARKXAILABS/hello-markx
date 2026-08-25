'use strict';

/**
 * Renderer component tests — real `.tsx`, rendered to real markup (FLOOR-15, issue #45).
 *
 * WHY THIS FILE EXISTS
 * Until this file the renderer's only coverage was `e2e/smoke.spec.ts`, one Playwright
 * flow. `TESTING.md` records the consequence in its own words: "no renderer component
 * tests ... 7 of 123 renderer files are touched by tests, all of them pure helpers".
 * A component could render an empty element, drop its accessible name, or stop showing
 * a safety indicator, and every one of the 59 test files would stay green. These tests
 * load the real component through `test/load-ts.cjs` and push it through
 * `renderToStaticMarkup`, so "it rendered nothing" is a test failure rather than a
 * thing you find out about by looking at the app.
 *
 * ZERO NEW DEPENDENCIES. `react` and `react-dom` are already production dependencies
 * (`package.json` `dependencies`, both `^18.3.1`) — `react-dom/server` is already
 * installed and costs nothing. D-27 rejected React Testing Library + jsdom: four
 * permanent devDependencies and a second test idiom, in a repo whose stated constraint
 * is "no framework — plain node --test" (PROJECT.md), bought for interaction coverage a
 * one-operator tool exercises by hand every session. Do not "upgrade" this to jsdom.
 *
 * THE CEILING, STATED UP FRONT (D-26)
 * `renderToStaticMarkup` is a SERVER render. It runs no effects, fires no events, and
 * never commits — so every assertion here is on the FIRST rendered markup and nothing
 * else. Things this file structurally cannot see:
 *   - anything that only appears after `useEffect` (there is no effect phase at all);
 *   - anything behind a click, hover, focus or keypress;
 *   - anything a `useState` setter produces after mount;
 *   - an ErrorBoundary's fallback. React error boundaries are inert on the server:
 *     `react-dom/server` RETHROWS a child's error instead of calling
 *     `getDerivedStateFromError`. Measured 2026-08-21 — `<ErrorBoundary>` around a
 *     throwing child does not render the fallback, it propagates the throw out of
 *     `renderToStaticMarkup`. Its only reachable branch here is the pass-through, which
 *     renders its child and nothing else (13 characters for a `<div>ok</div>`) and would
 *     assert essentially nothing. `ErrorBoundary.tsx` is therefore NOT tested here, on
 *     purpose, rather than smoke-checked for a green tick.
 * The pure derivations behind these components are covered separately and deliberately:
 *   `test/renderer-runstate.test.cjs` owns `store/autoMode.ts`'s rules. This file owns
 *   the question that one cannot answer — whether the MARKUP actually shows them.
 *
 * ASSERT SEMANTICS, NEVER MARKUP STRINGS
 * The rendered output is inline-style-heavy (an `AgentCard` render is ~2.6 KB, most of
 * it `style=`). Assertions are on accessible names, `role`, `aria-hidden` and visible
 * text — the things a legitimate refactor preserves and a broken render destroys. No
 * assertion here compares a full markup string or a `style=` attribute.
 *
 * WHAT THE HARNESS SUPPLIES, AND WHY NONE OF IT IS A MOCK
 * Node is not a browser and is not Vite, so four environment facts have to be handed to
 * the loader. Every one of them is something the real build already provides; not one of
 * them stands in for a component, a prop or a derivation under test:
 *   1. `globalThis.self` — `@xterm/addon-fit`'s UMD header evaluates `self` at module
 *      scope, and `AgentCard` reaches it through `./FullscreenTerminal` → `terminalPool`.
 *      Without this the LOAD throws `ReferenceError: self is not defined` before any
 *      component is reached.
 *   2. `.css` imports resolve to `{}` — `terminalPool.ts:44` does
 *      `import '@xterm/xterm/css/xterm.css'`. Vite handles that; Node tries to parse CSS
 *      as JavaScript and dies on `SyntaxError: Unexpected token '.'`.
 *   3. `@/…` resolves to `src/renderer/src/…` — the alias is identical in
 *      `tsconfig.web.json` (`paths`) and `electron.vite.config.ts` (`alias`).
 *      `resolveTs()` in `test/load-ts.cjs` handles `@shared/` and NOT `@/`, and it must
 *      stay that way: `test/pty-sanitize.test.cjs` deliberately PROXIES `@/…` so
 *      `useHive.ts` loads without its store, and widening the shared loader would hand
 *      that file the real modules instead. Resolving the alias here keeps the blast
 *      radius at exactly this file.
 *   4. `seedServerSnapshot()` — see the comment on it. Store state, not a fake store.
 * The stub intercepts ONLY `@/…` and `.css`. `react` and `react-dom` are passed straight
 * through to the real modules — the analog this is adapted from
 * (`test/pty-sanitize.test.cjs:1-19`) proxies `react` too, which is correct for testing a
 * pure function out of a hook file and catastrophic here: a Proxy renders as a Proxy and
 * every assertion below would pass against nothing at all.
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

/** `@/x` → the repo-relative path `loadTs` wants, trying the same candidates `resolveTs` does. */
function resolveAlias(request) {
  const base = path.join('src/renderer/src', request.slice(2));
  for (const candidate of [`${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]) {
    if (fs.existsSync(path.join(ROOT, candidate))) return candidate;
  }
  return null;
}

const origLoad = Module._load;
const origSelf = Object.getOwnPropertyDescriptor(globalThis, 'self');
globalThis.self = globalThis;
Module._load = function (request, ...rest) {
  if (request.endsWith('.css')) return {};
  if (request.startsWith('@/')) {
    const hit = resolveAlias(request);
    if (hit) return loadTs(hit);
  }
  return origLoad.call(this, request, ...rest);
};

let PixelBadge, BlockedBanner, AgentCard, useStore, autoModeFlagForProvider, AGENT_PROVIDER_PRESETS;
let relAge, TaskCard, TaskAge, TaskDetail, parseTasks, AskMeTab, refreshHiveTasks;
let PixelButton, blockReasonFromApproval, rosterBadgeStatus, formatRemaining, askOutcomeText;
let DayBandTab, AgentStatCard, mergeAgentViews, resetAgentViews, deriveCost;
try {
  ({ PixelBadge } = loadTs('src/renderer/src/components/PixelBadge.tsx'));
  ({ PixelButton } = loadTs('src/renderer/src/components/PixelButton.tsx'));
  // `formatRemaining` is exported for the same measured reason `blockReasonFromApproval`
  // and `rosterBadgeStatus` are: the countdown's rule table is a pure function of a
  // number, and pulling it out is what turns "five rendered states" from a checkpoint
  // item into five assertions in a harness that runs no effects.
  ({ BlockedBanner, formatRemaining } = loadTs('src/renderer/src/components/BlockedBanner.tsx'));
  ({ AgentCard } = loadTs('src/renderer/src/components/AgentCard.tsx'));
  ({ useStore } = loadTs('src/renderer/src/store/store.ts'));
  ({ autoModeFlagForProvider, AGENT_PROVIDER_PRESETS } = loadTs('src/shared/agentProvider.ts'));
  ({ relAge } = loadTs('src/shared/relAge.ts'));
  ({ TaskCard, TaskAge, TaskDetail, parseTasks } = loadTs('src/renderer/src/components/TasksKanban.tsx'));
  ({ AskMeTab } = loadTs('src/renderer/src/components/AskMeTab.tsx'));
  // The SAME module instance AskMeTab resolved through `@/hooks/useHiveTasks` — loadTs
  // caches by absolute path, and the alias above lands on this one. Reaching the shared
  // poll's module cache is the only way to render a board that has any cards on it.
  ({ refreshHiveTasks } = loadTs('src/renderer/src/hooks/useHiveTasks.ts'));
  // The GATE-03 refusal decision, exported from the hook for the same reason
  // `stopArmDecision` is (`useHive.ts:156`): it lives inside a `useEffect`, and this
  // harness has no effect phase at all (see the ceiling at :23-38), so the only way to
  // assert the SHIPPED assembly rather than a copy of it is to call it directly.
  ({ blockReasonFromApproval, askOutcomeText } = loadTs('src/renderer/src/hooks/useHive.ts'));
  // The roster badge's precedence rule. Exported for a MEASURED reason, not a stylistic
  // one: `armed` is derived from `breakers`, which is `useState({})` inside
  // `useFleetTelemetry` (`useTelemetry.ts:96`) and is filled only by an effect. This
  // harness never runs effects, so a rendered CommandCenterPanel has `armed === false`
  // for every row and the two armed cases below are unreachable through the panel.
  ({ rosterBadgeStatus } = loadTs('src/renderer/src/components/CommandCenterPanel.tsx'));
  // SCALE-03's day band. Loaded UNGUARDED, exactly like every sibling above: a
  // `try { … } catch {}` around this line is how a component that stopped
  // existing turns every assertion below it into a vacuous pass.
  ({ DayBandTab } = loadTs('src/renderer/src/components/DayBandTab.tsx'));
  // SCALE-05's consolidated stat card. `AgentDetailPanel.tsx` LOADS cleanly under this
  // shim — measured, not assumed — so the card below is the REAL shipped component and
  // every assertion on it is on real `renderToStaticMarkup` output, not on source text.
  //
  // What is NOT loaded, and why: the whole `AgentDetailPanel` cannot be server-rendered
  // at all. It reaches `PtyTerminalView` → `useAppTheme` (`src/renderer/src/design/
  // theme.ts:57`), which calls `useSyncExternalStore` with TWO arguments, and React 18
  // throws "Missing getServerSnapshot" for a two-arg call on the server. Two more
  // shipped call sites have the same shape (`realtime/costStore.ts:117`,
  // `realtime/session.ts:536`). None of those three files belongs to plan 03-08, so the
  // defect is REPORTED rather than patched here — and the consequence is stated rather
  // than papered over: these cases prove the CARD renders every branch; they do not
  // prove the panel mounts it. The mount is pinned structurally, separately, below.
  ({ AgentStatCard } = loadTs('src/renderer/src/components/AgentDetailPanel.tsx'));
  // The SAME module instance the card resolved through `@/store/agentView` — loadTs
  // caches by absolute path, so seeding through this reference is seeding the singleton
  // the component is about to read.
  ({ mergeAgentViews, resetAgentViews, deriveCost } = loadTs('src/renderer/src/store/agentView.ts'));
} finally {
  // Restore both immediately, exactly as the analog does — the shims exist for the LOAD,
  // not for the tests, and leaving either in place would change what the rest of this
  // process resolves.
  Module._load = origLoad;
  if (origSelf) Object.defineProperty(globalThis, 'self', origSelf);
  else delete globalThis.self;
}

// Every component is a NAMED export. CONVENTIONS.md:101 claims renderer .tsx files use
// default exports "per convention (implied by React/Vite tooling)"; measured 2026-08-21,
// `grep -rl "export default" src/renderer/src --include=*.tsx` matches 0 of 63 files, so
// a harness reaching for `.default` would get `undefined` from every one of them.
for (const [name, value] of Object.entries({ PixelBadge, PixelButton, BlockedBanner, AgentCard, useStore, relAge, TaskCard, TaskAge, TaskDetail, parseTasks, AskMeTab, refreshHiveTasks, AgentStatCard, mergeAgentViews })) {
  assert.equal(typeof value, 'function',
    `${name} did not come back from loadTs as a function — the component tests below would all render undefined`);
}

const html = (element) => renderToStaticMarkup(element);
/** Visible text only: what a reader actually sees, with every tag and attribute dropped. */
const visibleText = (markup) => markup.replace(/<[^>]*>/g, '').trim();

/**
 * Seed the state the SERVER render reads.
 *
 * zustand 4.5's `useStore` calls
 * `useSyncExternalStoreWithSelector(api.subscribe, api.getState, api.getServerState || api.getInitialState, ...)`,
 * and `renderToStaticMarkup` is a server render — so React reads the THIRD argument and
 * `setState()` is invisible here BY DESIGN. Measured 2026-08-21: a card seeded with
 * `useStore.setState({ agents: [...] })` renders byte-identically to one seeded with
 * nothing, because the server snapshot still returns the creation-time state. `api` is
 * not reachable from the bound hook either — `create()` does
 * `Object.assign(useBoundStore, api)`, which copies the methods onto a different object,
 * so assigning `useStore.getServerState` sets it somewhere `useStore` never looks
 * (also measured: no effect).
 *
 * The initial-state object IS the server snapshot, so that is the seam. This is the same
 * shape as the documented `require.cache` injection (`TESTING.md`): seed the thing the
 * code under test is about to read, before it reads it. Nothing is faked — the real
 * selector, the real `agentRowForCard()` and the real `isAutoModeAgent()` all run on it.
 */
function seedServerSnapshot(t, patch) {
  const snapshot = useStore.getInitialState();
  const before = {};
  for (const key of Object.keys(patch)) before[key] = snapshot[key];
  Object.assign(snapshot, patch);
  t.after(() => Object.assign(snapshot, before));
}

/** A store row for one agent. Inline factory per file — there is no test/fixtures. */
const agentRow = (extra = {}) => ({
  id: 'a1', name: 'Ada', ptyId: 'pty-1', provider: 'claude', command: 'claude', ...extra
});

/** A BlockReason. `actions: []` is the real operator-gated-tool shape, not a degenerate one. */
const blockReason = (actions) => ({
  summary: 'claude wants to run a command',
  detail: 'it asked for approval before touching the build directory',
  command: 'rm -rf build',
  actions
});

const cardProps = (extra = {}) => ({
  name: 'Ada', character: 'michael', accent: 'blue', status: 'working',
  ptyId: 'pty-1', project: 'hello-markx', ...extra
});

// ─── PixelBadge — the smallest real component in the tree ────────────────────────────

test('PixelBadge renders a real status chip rather than an empty element', () => {
  const markup = html(React.createElement(PixelBadge, { status: 'working' }));

  // A real floor for this component, not `length > 0`. A PixelBadge is ~420 characters
  // of markup; anything under 200 means the swatch or the label stopped rendering, which
  // is precisely the silent failure this file exists to catch.
  assert.ok(markup.length > 200,
    `PixelBadge rendered only ${markup.length} characters — the chip's swatch or its label has stopped rendering, and nothing else in the suite would notice`);
  assert.equal(visibleText(markup), 'working',
    'the status chip shows no readable text, so an operator can see a coloured square and not what state the agent is in');
});

test('PixelBadge renders a DIFFERENT chip for a different status prop', () => {
  const idle = html(React.createElement(PixelBadge, { status: 'idle' }));
  const blocked = html(React.createElement(PixelBadge, { status: 'blocked' }));

  assert.notEqual(idle, blocked,
    'an idle agent and one that needs you render identical markup — the status prop is being ignored, so every card on the floor would show the same state');
  assert.equal(visibleText(idle), 'idle',
    'the idle chip lost its label');
  // "blocked" is deliberately worded for the human, not the state machine
  // (PixelBadge.tsx:33-35): it means the agent is waiting on YOU.
  assert.equal(visibleText(blocked), 'needs you',
    'a blocked agent no longer says "needs you" — the one chip whose whole job is to get a human to look at it has gone silent');
});

// ─── BlockedBanner — sibling .tsx value imports (PixelButton, Icon) ───────────────────

test('BlockedBanner with zero actions still renders a way to dismiss it', () => {
  const answerable = html(React.createElement(BlockedBanner, {
    reason: blockReason([{ label: 'approve', kind: 'approve', send: 'y' }]), onAction: () => {}
  }));
  const notice = html(React.createElement(BlockedBanner, { reason: blockReason([]), onAction: () => {} }));

  assert.notEqual(answerable, notice,
    'a banner with actions and a banner with none render identically — the actions prop is not reaching the buttons');
  assert.match(visibleText(answerable), /approve/,
    "the banner's own action button vanished, so the operator is shown a prompt they cannot answer");
  // BlockedBanner.tsx:71-81: useHive raises an operator-gated-tool reason with
  // `actions: []` because the call was already denied and there is nothing to answer.
  // Without the fallback control that banner is permanently un-closable.
  assert.match(visibleText(notice), /dismiss/,
    'a reason carrying no actions rendered no control at all — that banner can never be closed, and it is the shape useHive actually raises');
});

test("BlockedBanner's bell glyph is hidden from assistive technology", () => {
  const markup = html(React.createElement(BlockedBanner, {
    reason: blockReason([]), onAction: () => {}
  }));

  // FLOOR-12's rule: a decorative glyph carries aria-hidden, so a screen reader announces
  // "needs you" once instead of also reading out the icon that decorates it.
  assert.match(markup, /<svg[^>]*\saria-hidden="true"/,
    'the banner\'s decorative bell is exposed to the accessibility tree — it will be announced alongside the heading it only decorates');
  assert.match(visibleText(markup), /needs you/,
    'the banner heading is gone, so the loudest thing in the app has no words');
  assert.match(visibleText(markup), /claude wants to run a command/,
    'the reason summary is not rendered — the banner tells the operator they are needed without saying what for');
});

// ─── AgentCard — FLOOR-01 and FLOOR-13, on the markup the operator actually sees ──────

test('FLOOR-01: the AUTO chip appears only when the agent runs with permissions bypassed', (t) => {
  // Built from the provider's own spawn flag rather than a literal, because that is what
  // buildSpawnCommand() appends and what the chip's derivation reads.
  const bypassFlag = autoModeFlagForProvider('claude');
  assert.ok(bypassFlag, 'claude has no auto-mode flag, so this test can no longer construct a bypassed agent');

  seedServerSnapshot(t, { agents: [agentRow({ command: 'claude' })] });
  const normal = html(React.createElement(AgentCard, cardProps()));

  assert.doesNotMatch(normal, />AUTO</,
    'a card for an agent spawned WITHOUT the bypass flag shows the AUTO chip — the safety indicator is lying in the dangerous direction, claiming an agent needs no approval when it does');

  Object.assign(useStore.getInitialState().agents[0], { command: `claude ${bypassFlag}` });
  const bypassed = html(React.createElement(AgentCard, cardProps()));

  assert.match(bypassed, />AUTO</,
    'an agent running with permissions bypassed shows no AUTO chip — the operator has no way to see which agents act without asking, which is the whole of FLOOR-01');
  // AgentCard.tsx:184-187: an aria-label on the container REPLACES all inner text for a
  // screen reader, so the chip is aria-hidden and the state is folded into the label
  // instead. Announced once, not twice, and never zero times.
  assert.match(bypassed, /<span aria-hidden="true"[^>]*>AUTO<\/span>/,
    'the AUTO chip is no longer aria-hidden — with the card carrying its own aria-label the chip is either announced twice or, if the label loses the phrase too, not at all');
  assert.match(bypassed, /aria-label="[^"]*Auto mode[^"]*runs with permissions bypassed[^"]*"/,
    "the card's accessible name dropped the auto-mode phrase — the chip is aria-hidden, so a screen-reader user is now told nothing at all about the bypass");
  assert.doesNotMatch(normal, /aria-label="[^"]*permissions bypassed[^"]*"/,
    'a card for a non-bypassed agent announces "permissions bypassed" — the accessible name is wrong in the dangerous direction');
});

test('FLOOR-13: the card shows the model, and shows it before the cost', (t) => {
  seedServerSnapshot(t, { agents: [agentRow({ model: 'claude-sonnet-4-5-20250929' })] });
  const markup = html(React.createElement(AgentCard, cardProps({ usd: 1.23 })));

  // FLOOR-13 is "the renderings of an agent agree on the field set". The fullscreen
  // roster row and the command-centre row always showed the model; the card did not,
  // so the three disagreed about what an agent IS. Asserted on the card's own title,
  // which is where the full id lives.
  assert.match(markup, /title="Model: claude-sonnet-4-5-20250929"/,
    "the card's model field is gone — the three agent renderings disagree about what an agent is again, which is the defect FLOOR-13 closed");
  assert.match(visibleText(markup), /\$1\.23/,
    'the card shows no spend — the one number an operator asks about first is missing from the rendering they look at most');

  // Deliberately an assertion about two FIELDS' order, not about DOM structure: "the
  // card shows the model, before the cost" is the requirement's own wording, and plan 12
  // could only prove it by comparing source offsets in the bundle. This proves it on
  // rendered output. Money is what is being asked about; the model is context for it.
  assert.ok(markup.indexOf('Model: claude-sonnet-4-5-20250929') < markup.indexOf('$1.23'),
    'the cost now renders before the model — FLOOR-13 puts the model first because the cost is the answer and the model is the question it belongs to');

  const noModel = html(React.createElement(AgentCard, cardProps({ usd: 1.23, ptyId: 'pty-absent' })));
  assert.match(visibleText(noModel), /CLI default/,
    'an agent with no resolvable store row renders a blank where the model goes, instead of saying it runs the CLI default — a blank reads as "unknown" and hides that the card failed to find its own row');
});

test('FLOOR-13: the model chip is bounded, so it cannot drop the card\'s project line', (t) => {
  // The card was widened 220 -> 322 (AgentCard.tsx's own arithmetic comment)
  // because an unshrinkable `flexShrink: 0` sibling drove the row's only flexible
  // item to ZERO width, and that comment calls the result "not truncation, it is
  // a dropped field". The model chip is `flexShrink: 0` and was added two rows
  // below that fix with none of its three guards, so it reintroduces the defect.
  //
  // A real preset value, not a hypothetical: 21 unshrinkable characters that
  // shortModel() passes through untouched.
  const LONGEST_MODEL = 'Gemini 3.1 Pro (High)';
  assert.ok(AGENT_PROVIDER_PRESETS.some((p) => p.recommendedOrchestratorModel === LONGEST_MODEL),
    `no preset offers '${LONGEST_MODEL}' any more — this test is measuring a model name the app can no longer produce, so it proves nothing about the longest real one`);

  seedServerSnapshot(t, { agents: [agentRow({ model: LONGEST_MODEL })] });
  const markup = html(React.createElement(AgentCard, cardProps()));

  // Located by the chip's OWN title, never by counting `text-overflow` in the
  // document: this card emits FOUR other elements that already carry all three
  // properties (the name, `infoLine`, the account chip, the note), so a
  // document-wide count cannot tell the chip apart from its siblings and would
  // stay green with the chip unbounded.
  const chipStyle = (m, title) => {
    const hit = new RegExp(`<span title="${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" style="([^"]*)"`).exec(m);
    assert.ok(hit, `no <span> carries title="${title}" — the model chip's title is what makes an ellipsis lossless, so losing it is not a fix`);
    return hit[1];
  };

  const style = chipStyle(markup, `Model: ${LONGEST_MODEL}`);
  assert.match(style, /max-width:/,
    `the model chip has no max-width (style: ${style}) — 21 unshrinkable characters take the width out of infoLine, the row's only flexible item, and the card drops its project/action line`);
  assert.match(style, /overflow:hidden/,
    `the model chip does not clip (style: ${style}) — a max-width with no overflow guard spills the chip over the card's border instead of containing it`);
  assert.match(style, /text-overflow:ellipsis/,
    `the model chip truncates with no ellipsis (style: ${style}) — the operator cannot tell a clipped model id from a short one`);

  // The `CLI default` fallback is the same element and takes the same guards.
  const fallback = html(React.createElement(AgentCard, cardProps({ ptyId: 'pty-absent' })));
  const fbStyle = chipStyle(fallback, 'Runs the CLI default model');
  for (const decl of [/max-width:/, /overflow:hidden/, /text-overflow:ellipsis/]) {
    assert.match(fbStyle, decl,
      `the 'CLI default' chip is bounded differently from the model chip (style: ${fbStyle}) — one span, one set of guards`);
  }

  // CEILING, stated so nobody reads more into a green tick than is there:
  // `renderToStaticMarkup` is a server render with NO LAYOUT. This proves the
  // guards are PRESENT. Whether the row actually composes without clipping at
  // 322px is an operator observation and is not claimed here.
});

test('SCALE-05: an agent at 7/8 with NO reported context limit still renders the coral compaction warning', (t) => {
  // The regression the threshold rewire could silently cause, and the reason
  // `deriveContextColor` has ONE signature and it is percentage-based.
  //
  // This card colours its gauge from the `progress` 0..8 INTEGER, not from a token
  // count: `contextLimit` reaches only the tooltip. A `deriveContextColor(tokens,
  // limit)` signature would therefore have been fed `undefined` here, returned the
  // neutral accent, and deleted the "about to compact" warning for every agent whose
  // limit was never reported — a safety indicator going dark with no test failing.
  //
  // This case asserts on an inline `style=` attribute, which the file header at :43
  // otherwise forbids. The exception is deliberate and narrow: the colour IS the
  // signal here, there is no text or accessible name carrying it, and the element is
  // located by its own `title` rather than by counting styles document-wide.
  seedServerSnapshot(t, { agents: [agentRow()] });
  const gaugeFill = (markup) => {
    const i = markup.indexOf('title="Context gauge');
    assert.ok(i > 0,
      'the gauge\'s own title is gone, so this case can no longer find the element it measures');
    const hit = /background:([^;"]*)/.exec(markup.slice(markup.indexOf('<div style="width:', i)));
    assert.ok(hit, 'the gauge fill element rendered no background — the bar has no colour at all');
    return hit[1].trim();
  };

  assert.equal(
    gaugeFill(html(React.createElement(AgentCard, cardProps({ progress: 7, contextLimit: undefined })))),
    'var(--cth-coral)',
    'an agent at 7/8 context with no reported limit lost its coral compaction warning');

  // The two controls, so the case above cannot pass by the gauge being coral always.
  assert.equal(
    gaugeFill(html(React.createElement(AgentCard, cardProps({ progress: 6, contextLimit: undefined })))),
    'var(--cth-lemon)', 'the 6/8 step no longer warns');
  assert.equal(
    gaugeFill(html(React.createElement(AgentCard, cardProps({ progress: 2, contextLimit: undefined })))),
    'var(--cth-blue)', 'a comfortable agent is being coloured as though it were under pressure');
});

// ─── SCALE-05 — the consolidated stat card, on real markup ───────────────────────────
//
// COVERAGE STATEMENT, so no future reader mistakes these for grep checks: every
// assertion below is on `renderToStaticMarkup` output from the REAL shipped
// `AgentStatCard` exported by `src/renderer/src/components/AgentDetailPanel.tsx`. The
// component is loaded, mounted and rendered; a card that stopped rendering a branch
// fails here. The ceiling is stated at the loader above: the surrounding
// `AgentDetailPanel` cannot be server-rendered (a two-arg `useSyncExternalStore` in
// `design/theme.ts`), so THAT the panel mounts this card is pinned structurally in the
// last case of this block, not proven by render.

/** An agent row shaped as the card's `agent` prop. */
const statAgent = (extra = {}) => ({
  id: 'a1', name: 'Ada', accent: 'blue', command: 'claude', provider: 'claude', ...extra
});

/** Render the card with the agentView singleton seeded for this agent id. */
function statCard(t, { agent = {}, view = undefined, accountLabel } = {}) {
  resetAgentViews();
  t.after(() => resetAgentViews());
  if (view) mergeAgentViews({ [agent.id ?? 'a1']: view });
  return html(React.createElement(AgentStatCard, { agent: statAgent(agent), accountLabel }));
}

test('SCALE-05: all five labels render, in the contract order', (t) => {
  const markup = statCard(t, { view: { usd: 1, spawnedAt: Date.now() - 5000 } });

  // Read the LABEL elements, not the card's visible text. A `text.includes('account')`
  // check is worthless here and was measured to be: the account cell's VALUE is
  // `Login account`, so the substring survives the label being renamed or dropped
  // entirely — a mutant that renamed it passed. `--cth-text-body-sm` is the label
  // element's own size token and nothing else in this card uses it.
  const labels = [...markup.matchAll(/<div style="[^"]*--cth-text-body-sm[^"]*">([^<]*)<\/div>/g)]
    .map((m) => m[1]);
  assert.deepEqual(labels, ['cost', 'up', 'context', 'account', 'state'],
    `the card's five labels are wrong, reordered or missing (rendered: ${JSON.stringify(labels)})`);
});

test("SCALE-05: a costTracking:'none' engine renders `no cost meter` with NO $ anywhere", (t) => {
  // grok is a 'none'-tier preset — pinned against the real table rather than assumed,
  // so this case says so instead of quietly asserting nothing if the tiers move.
  assert.equal(AGENT_PROVIDER_PRESETS.find((p) => p.id === 'grok')?.costTracking, 'none',
    'grok is no longer a costTracking:\'none\' engine — re-derive which preset is before trusting this case');

  // THE PREMISE, pinned rather than assumed: this fixture must actually take the
  // unmeasured branch. Without it, a `deriveCost` that started returning a measured
  // value for a 'none' engine would make the `$`-free assertion below pass for the
  // wrong reason — the cell would be rendering nothing at all, not a declared gap.
  const grokPreset = AGENT_PROVIDER_PRESETS.find((p) => p.id === 'grok');
  assert.partialDeepStrictEqual(
    deriveCost({ usd: 0, costUnattributed: false }, grokPreset.costTracking, grokPreset.label, 'Ada'),
    { kind: 'unmeasured', reasonKind: 'no-meter' },
    'the fixture below no longer produces an unmeasured cost, so its no-$ assertion proves nothing');

  const markup = statCard(t, {
    agent: { provider: 'grok', command: 'grok' },
    view: { usd: 0, costUnattributed: false }
  });
  const text = visibleText(markup);
  assert.ok(text.includes('no cost meter'),
    'an engine that cannot report spend renders no declared gap — the cell reads as a measurement');
  // T-03-08b's claimed mitigation, made real: the whole rendered card carries no `$`.
  assert.ok(!markup.includes('$'),
    'the card rendered a `$` for an engine with no cost meter — a $0.00 that reads as "cheap" is the faked zero D-35 forbids');
});

test("SCALE-05: an unattributable CLAUDE agent is NOT told its engine has no meter", (t) => {
  // The round-9 defect, on markup. `costUnattributed: true` is 03-02's common case
  // (`!u && !own`), and claude HAS a meter — so the engine-level sentence here would be
  // a false capability claim on the path most agents take.
  // Same premise pin as the no-meter case: claude is an 'otel' engine, so the ONLY
  // thing that can make this unmeasured is `costUnattributed`.
  assert.partialDeepStrictEqual(
    deriveCost({ usd: 0, costUnattributed: true }, 'otel', 'Claude', 'Ada'),
    { kind: 'unmeasured', reasonKind: 'unattributed' },
    'costUnattributed no longer produces its own gap — the card would print a measured $0.00 for an agent whose spend is unknown');

  const markup = statCard(t, { view: { usd: 0, costUnattributed: true } });
  const text = visibleText(markup);
  assert.ok(!text.includes('no cost meter'),
    'an unattributable Claude agent is told its engine reports no cost — it does; what is missing is the per-agent attribution, and naming the wrong gap sends the operator to the wrong fix');
  assert.ok(text.includes('spend not attributable'),
    'the unattributed gap renders no words of its own');
  assert.ok(!markup.includes('$'),
    'a `$` rendered for an agent whose spend cannot be attributed — that is precisely the faked zero');
});

test('SCALE-05: a measured engine that spent nothing DOES render $0.00', (t) => {
  // The other direction, and it is the control that stops the three cases above from
  // passing by the card simply never printing a dollar sign.
  const text = visibleText(statCard(t, { view: { usd: 0, costUnattributed: false } }));
  assert.ok(text.includes('$0.00'),
    'a metered engine that has genuinely spent nothing no longer shows $0.00 — the gap branch has swallowed a real measurement');
});

test('SCALE-05: an all-time transcript total renders labelled, never as this session', (t) => {
  const markup = statCard(t, { view: { usd: 1.23, costLifetime: true, costUnattributed: false } });
  assert.match(visibleText(markup), /\$1\.23 \(lifetime\)/,
    'a cumulative all-time figure renders as a bare dollar amount beside an `up` clock that resets every respawn — it claims a window it never had');
  assert.match(markup, /title="[^"]*ALL-TIME[^"]*"/,
    'the lifetime figure carries no explanation of what window it covers');

  const session = visibleText(statCard(t, { view: { usd: 1.23, costLifetime: false, costUnattributed: false } }));
  assert.ok(session.includes('$1.23') && !session.includes('lifetime'),
    'an ordinary session figure is being labelled lifetime — the discriminator is not reaching the render');
});

test('SCALE-05: an agent with no spawnedAt renders `not recorded`, never 0s', (t) => {
  const text = visibleText(statCard(t, { view: { usd: 0, costUnattributed: false } }));
  assert.ok(text.includes('not recorded'),
    'an agent with no spawn stamp renders no declared gap in the `up` cell');
  assert.ok(!/\b0s\b/.test(text),
    '`0s` rendered for an agent whose spawn time was never recorded — that reads as "it just started", the opposite of the truth for an agent up for days');

  // The control: a real stamp still produces a real clock.
  const up = visibleText(statCard(t, { view: { spawnedAt: Date.now() - 4 * 60_000 } }));
  assert.ok(up.includes('4m'), 'a recorded spawn stamp no longer renders an uptime');
  assert.ok(!up.includes('not recorded'), 'the gap string renders even when the stamp is present');
});

test('SCALE-05: an agent with no context pair renders `not reported`, never 0% and no rail', (t) => {
  // Round-3 #27: UI-SPEC S2b mandates this branch and, until this plan, nothing in the
  // plan set implemented it — `context` was the one of five cells with no gap path.
  const markup = statCard(t, { view: { usd: 0, costUnattributed: false } });
  const text = visibleText(markup);
  assert.ok(text.includes('not reported'),
    'an agent with no reported context window renders no declared gap');
  assert.ok(!text.includes('%'),
    'a percentage rendered for an agent that reported no context window — `0%` reads as "empty context", which is a measurement nobody took');
  // `not recorded` and `not reported` are DIFFERENT strings for DIFFERENT facts, and
  // neither may stand in for the other.
  assert.ok(text.includes('not recorded') && text.includes('not reported'),
    'the two gap strings have been merged — `not recorded` is the missing spawn stamp and `not reported` is the missing token/limit pair');

  const measured = visibleText(statCard(t, {
    agent: { contextTokens: 50_000, contextLimit: 200_000 },
    view: { usd: 0, costUnattributed: false }
  }));
  assert.ok(measured.includes('50k / 200k (25%)'),
    'a fully reported context window no longer renders its numbers');
  assert.ok(!measured.includes('not reported'), 'the gap string renders over a real measurement');
});

test('SCALE-05: block state reads `unknown` before the breaker resolves, never `healthy`', (t) => {
  // D-36, on markup. `onBreakerState` only fires on the next ~30s beat, so a card that
  // defaulted to healthy would call a STOPPED agent safe for a full beat after every
  // window reload.
  const text = visibleText(statCard(t, { view: { usd: 0, costUnattributed: false } }));
  assert.ok(text.includes('unknown'),
    'a card whose breaker snapshot has not resolved renders no state at all');
  assert.ok(!text.includes('healthy'),
    'the state cell defaulted to `healthy` for an agent the breaker has never reported on — that is failing safe in the wrong direction');

  const stopped = statCard(t, { view: { breaker: { level: 'stopped', reason: 'budget exhausted' } } });
  assert.ok(visibleText(stopped).includes('stopped'), 'a resolved breaker level no longer renders');
  assert.match(stopped, /title="[^"]*budget exhausted[^"]*"/,
    "an armed breaker renders without its reason, so the operator sees that an agent was cut off and not why");
});

test('SCALE-05: the account cell names the login account rather than rendering blank', (t) => {
  assert.ok(visibleText(statCard(t, { view: { usd: 0 } })).includes('Login account'),
    'an agent with no pool pin renders an empty account cell — "no pin" has a real, shipped name');
  assert.ok(visibleText(statCard(t, { view: { usd: 0 }, accountLabel: 'work' })).includes('work'),
    'a pinned account label is not reaching the cell');
});

test('SCALE-05: the card reflows rather than pinning five fixed columns', (t) => {
  // The container is the only layout claim this harness can make — a server render has
  // no layout, so the COLUMN COUNT at a given width is an operator measurement (plan
  // 03-08 Task 4) and is not claimed here. What IS checked is that the declaration
  // which makes reflow possible is present, because a fixed five-column row is the
  // "one unshrinkable sibling" shape that once drove this app's agent name to 0 width.
  const markup = statCard(t, { view: { usd: 0 } });
  assert.match(markup, /grid-template-columns:repeat\(auto-fit,\s*minmax\(120px,\s*1fr\)\)/,
    'the stat card no longer declares an auto-fit/minmax grid — it cannot reflow in the docked rail');
});

test('SCALE-05: AgentDetailPanel actually MOUNTS the card, and the god deliberately does not', () => {
  // STRUCTURAL, and labelled as such: the panel cannot be server-rendered (see the
  // loader comment), so "the card is on screen for a worker" is asserted on source.
  // Without this clause every case above could pass against a component nothing renders
  // — the producer-with-no-consumer shape this plan exists to close in the first place.
  const src = fs.readFileSync(path.join(ROOT, 'src/renderer/src/components/AgentDetailPanel.tsx'), 'utf8');
  assert.match(src, /<AgentStatCard\b/,
    'AgentDetailPanel no longer renders AgentStatCard — the card exists and nothing shows it');
  assert.ok(src.indexOf('<AgentStatCard') < src.indexOf('<BlockedBanner'),
    'the stat card moved below the BlockedBanner — :216-221 records that the banner sits directly above the tabs on purpose, because a prompt waiting on a human outranks whichever tab is open');

  // S2d's residual, declared where the code makes it.
  const godReturn = src.indexOf('if (agent.isGod)');
  assert.ok(godReturn > 0, 'the god early-return is gone — S2d\'s residual no longer describes this file');
  assert.match(src.slice(Math.max(0, godReturn - 900), godReturn), /neither duration\s*\n?\s*\/\/\s*nor account|NEITHER DURATION[\s\S]{0,40}NOR ACCOUNT/i,
    'the god-coverage gap is no longer stated at the early return that causes it — S2d requires it be declared out loud, not implied');
});

// ─── relAge — VIGIL-04's one shared formatter (04-UI-SPEC § S5 rule A-1) ──────────────

/**
 * `WorkersTab.tsx:20`'s shipped `relAge`, lifted OUT OF ITS SOURCE and evaluated.
 *
 * Rule A-1 keeps the four existing relative-time implementations exactly where they are, so
 * `src/shared/relAge.ts` is a COPY of one of them — and a copy is only worth anything if
 * something notices when the two drift. Transcribing the body into this file would assert
 * that the transcription matches itself. Reading the real source means the parity test below
 * fails the day somebody edits `WorkersTab.tsx`, which is precisely when it should.
 *
 * The function is module-private in `WorkersTab.tsx` (not exported, and the component around
 * it cannot be server-rendered), so there is no import that reaches it.
 */
function shippedRelAge() {
  const src = fs.readFileSync(path.join(ROOT, 'src/renderer/src/components/WorkersTab.tsx'), 'utf8');
  const m = /function relAge\(ms: number\): string \{[\s\S]*?\n\}/.exec(src);
  assert.ok(m, 'WorkersTab.tsx no longer declares `function relAge(ms: number): string` — re-derive this anchor by content, not by line');
  // ONLY the two type annotations in the signature are stripped; the BODY is untouched.
  return new Function(`${m[0].replace('(ms: number): string', '(ms)')}; return relAge;`)();
}

test('relAge renders the five terse shapes, and names the unit alongside each', () => {
  assert.deepEqual(relAge(0), { text: '0s', unit: 's' });
  assert.deepEqual(relAge(47_000), { text: '47s', unit: 's' });
  assert.deepEqual(relAge(4 * 60_000), { text: '4m', unit: 'm' });
  assert.deepEqual(relAge(9 * 3_600_000), { text: '9h', unit: 'h' });
  assert.deepEqual(relAge(3 * 86_400_000), { text: '3d', unit: 'd' });

  // The unit is the whole reason this returns an object. 04-UI-SPEC rule A-2 defines stale as
  // "the age stopped being minutes" — the caller reads the unit letter instead of comparing
  // against a threshold constant nobody will remember, so the emphasis and the letter can
  // never disagree on screen.
  assert.equal(relAge(89 * 60_000).unit, 'm', 'the m/h boundary moved — rule A-2 ties the stale treatment to it');
  assert.equal(relAge(91 * 60_000).unit, 'h', 'the m/h boundary moved — rule A-2 ties the stale treatment to it');
});

test('relAge is byte-compatible with the shipped WorkersTab formatter on every finite input', () => {
  const shipped = shippedRelAge();
  // The four cuts first (<1000ms, <90s, <90m, <48h), then ordinary values around them.
  const inputs = [
    -10_000, -1, 0, 999, 1000, 1499, 1500, 47_000, 89_000, 89_499, 89_500, 90_000,
    4 * 60_000, 89 * 60_000, 90 * 60_000, 9 * 3_600_000, 47 * 3_600_000, 48 * 3_600_000,
    3 * 86_400_000, 400 * 86_400_000
  ];
  for (const ms of inputs) {
    assert.equal(relAge(ms).text, shipped(ms),
      `relAge(${ms}) diverged from the shipped WorkersTab formatter — rule A-1 extracts that shape verbatim, so a boundary that differs is a regression nobody asked for`);
  }
});

test('relAge corrects exactly ONE thing: the shipped formatter renders `NaNd` for a non-finite input', () => {
  const shipped = shippedRelAge();

  // The positive control (D-33/D-40): the defect being corrected is MEASURED here rather than
  // asserted from memory. `NaN < 1000` is false, so the shipped guard falls through to
  // Math.round(NaN / 1000) and the NaN reaches the last branch intact.
  assert.equal(shipped(NaN), 'NaNd',
    'WorkersTab no longer renders `NaNd` for NaN — the one divergence src/shared/relAge.ts deliberately carries has been fixed upstream, so re-read rule A-1 before keeping it');
  assert.equal(shipped(Infinity), 'Infinityd',
    'WorkersTab no longer renders `Infinityd` for Infinity — same as above');

  // T-04-AGE-06: a malformed `updatedAt` reaches this as NaN through Date.parse, and a card
  // reading `NaNd` is worse than one reading `0s` — it looks like a crash on the board.
  assert.deepEqual(relAge(NaN), { text: '0s', unit: 's' },
    'relAge renders NaN as something other than 0s — a card whose updatedAt does not parse now shows a broken age');
  assert.deepEqual(relAge(Infinity), { text: '0s', unit: 's' });
  assert.deepEqual(relAge(-Infinity), { text: '0s', unit: 's' });
  assert.deepEqual(relAge(-1), { text: '0s', unit: 's' });
  assert.doesNotThrow(() => relAge(undefined), 'relAge threw on a missing input instead of degrading to 0s');
});

// ─── VIGIL-04 / VIGIL-02 — the age and the released card on the kanban meta row ───────

/** The clock icon's path data, read from `Icon.tsx` rather than transcribed — channel 4
 *  of rule A-2 is "an `<Icon name="clock" />` is present", and matching `<svg` alone would
 *  stay green if the wrong icon were rendered. */
const CLOCK_PATH = (() => {
  const src = fs.readFileSync(path.join(ROOT, 'src/renderer/src/components/Icon.tsx'), 'utf8');
  const m = /\bclock:\s*\{[\s\S]*?ink:\s*'([^']+)'/.exec(src);
  assert.ok(m, "Icon.tsx no longer defines a `clock` entry with an `ink` path — re-derive this anchor");
  return m[1];
})();
const hasClock = (markup) => markup.includes(CLOCK_PATH);

/**
 * The whole `<span>` whose `title` attribute STARTS WITH `prefix` — the age element.
 *
 * Located by its tooltip, never by position: rule A-3 makes the tooltip the age's own
 * identity (`updated …` / `created … — never updated` / `asked …`), so an assertion keyed
 * on it cannot drift onto a sibling. The age span nests at most an `<svg>`, which contains
 * no `</span>`, so the first one after the open tag closes it.
 */
function ageElement(markup, prefix) {
  const at = markup.indexOf(`title="${prefix}`);
  assert.ok(at >= 0, `no element carries a title starting with "${prefix}" — VIGIL-04's age is missing from this render:\n${markup}`);
  const start = markup.lastIndexOf('<', at);
  const end = markup.indexOf('</span>', at);
  assert.ok(end > start, `the element titled "${prefix}…" never closes`);
  return markup.slice(start, end + '</span>'.length);
}

/** An ISO timestamp `ms` in the past. Ages are DERIVED AT RENDER (D-32), so every fixture
 *  here is a stored instant and never an elapsed number. */
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const NINE_HOURS = 9 * 3_600_000;
const FOUR_MINUTES = 4 * 60_000;

const kanbanTask = (extra = {}) => ({
  id: 't-1', title: 'ship the release drop', status: 'doing', dependsOn: [], priority: 3,
  createdAt: ago(NINE_HOURS), ...extra
});
const kanbanCard = (task = {}, extra = {}) => ({
  task: kanbanTask(task), accent: 'var(--cth-sky)', onOpen: () => {}, onDismiss: () => {}, ...extra
});

test('VIGIL-04: a nine-hour card and a four-minute card differ on ALL FOUR channels, not on colour alone', () => {
  // 04-UI-SPEC § S5 rule A-2 asks for this as ONE test, deliberately. A test that checked a
  // single channel would pass against an implementation that satisfies DESIGN.md:707's
  // "never colour alone" rule on paper and not on screen.
  const stale = html(React.createElement(TaskCard, kanbanCard({ updatedAt: ago(NINE_HOURS) })));
  const fresh = html(React.createElement(TaskCard, kanbanCard({ updatedAt: ago(FOUR_MINUTES) })));
  const staleAge = ageElement(stale, 'updated ');
  const freshAge = ageElement(fresh, 'updated ');

  // 1 — unit letter
  assert.equal(visibleText(staleAge), '9h', 'the stale card does not render its age as 9h');
  assert.equal(visibleText(freshAge), '4m', 'the fresh card does not render its age as 4m');
  // 2 — colour
  assert.match(staleAge, /color:var\(--cth-ink-900\)/, 'the stale age is not on the ink-900 end of the ramp');
  assert.match(freshAge, /color:var\(--cth-ink-500\)/, 'the fresh age lost its ink-500 whisper treatment');
  assert.doesNotMatch(freshAge, /color:var\(--cth-ink-900\)/, 'a four-minute card is drawn as emphatically as a nine-hour one — the distinction VIGIL-04 exists for is gone');
  // 3 — weight
  assert.match(staleAge, /font-weight:600/, 'the stale age is not bolder than the fresh one');
  assert.doesNotMatch(freshAge, /font-weight:600/, 'the fresh age is already at weight 600, so the stale one cannot escalate past it');
  // 4 — icon
  assert.ok(hasClock(staleAge), 'the stale age carries no clock icon — the one channel a colour-blind operator reads first');
  assert.ok(!hasClock(freshAge), 'a four-minute card shows the clock icon, so the icon says nothing');
});

test('VIGIL-04: a done card takes no stale emphasis, however old it is', () => {
  const done = html(React.createElement(TaskCard, kanbanCard({ status: 'done', updatedAt: ago(NINE_HOURS) })));
  const age = ageElement(done, 'updated ');

  // Positive lower bound first (D-33/D-40): the age IS rendered on a done card. The
  // assertion below is about the emphasis, not about the age going missing.
  assert.equal(visibleText(age), '9h', 'a done card renders no age at all — the negative assertions below would pass against an empty element');
  assert.ok(!hasClock(age), 'a card finished nine hours ago is lit up as a problem; rule A-2 exempts done deliberately, because that is noise');
  assert.doesNotMatch(age, /font-weight:600/, 'a done card takes the stale weight');
  assert.match(age, /color:var\(--cth-ink-500\)/, 'a done card takes the stale colour');

  // …and the same age in todo DOES escalate — todo is included deliberately, because a card
  // nobody picked up for nine hours is the same failure as one nobody finished.
  const todo = html(React.createElement(TaskCard, kanbanCard({ status: 'todo', updatedAt: ago(NINE_HOURS) })));
  assert.ok(hasClock(ageElement(todo, 'updated ')), 'a nine-hour TODO card takes no emphasis — a card nobody picked up is the same failure as one nobody finished');
});

test('VIGIL-04: the meta row renders on a card with no assignee, carrying the age alone', () => {
  const markup = html(React.createElement(TaskCard, kanbanCard({ updatedAt: ago(FOUR_MINUTES) })));

  assert.equal(visibleText(ageElement(markup, 'updated ')), '4m',
    'an unassigned card renders no age — rule A-4 makes that row unconditional precisely so the age survives when the assignee does not');
  assert.match(visibleText(markup), /ship the release drop/,
    'the card lost its title, so the age assertion above is measuring a card that renders nothing else');

  // …and an assignee still renders, in the same slot, unchanged.
  const assigned = html(React.createElement(TaskCard, kanbanCard({ updatedAt: ago(FOUR_MINUTES) }, { assigneeName: 'Ada' })));
  assert.match(visibleText(assigned), /ADA/, 'the assignee vanished from the meta row when the row became unconditional');
  assert.equal(visibleText(ageElement(assigned, 'updated ')), '4m', 'the age vanished once an assignee shared the row with it');
});

test('VIGIL-04: a card that has never been updated SAYS so, rather than passing createdAt off as a change time', () => {
  // T-04-AGE-07. Every card on disk before this phase has createdAt and no updatedAt, so
  // this is the common case, not the edge one.
  const markup = html(React.createElement(TaskCard, kanbanCard({ createdAt: ago(NINE_HOURS) })));

  const age = ageElement(markup, 'created ');
  assert.equal(visibleText(age), '9h', 'the age is not derived from createdAt when updatedAt is absent');
  assert.match(markup, /never updated/,
    'the tooltip does not say which clock it read — "nothing has changed in nine hours" and "nothing has ever touched this" now read identically');
  assert.doesNotMatch(markup, /title="updated /,
    'a card with no updatedAt claims to have been updated');
  // The fallback is still a real age, and it still escalates.
  assert.ok(hasClock(age), 'an age derived from createdAt does not take the stale treatment, so an untouched card looks fresh forever');
});

test('VIGIL-02: a released card reads DROPPED BY in coral, and renders NO placeholder for a branch it does not have yet', () => {
  const markup = html(React.createElement(TaskCard, kanbanCard(
    { status: 'todo', assignee: undefined, updatedAt: ago(FOUR_MINUTES), released: { by: 'a1', at: ago(FOUR_MINUTES) } },
    { releasedByName: 'Ada' }
  )));

  assert.match(visibleText(markup), /DROPPED BY ADA/,
    'a card whose owner\'s terminal died says nothing about who dropped it — VIGIL-02 is "who, and how long ago" on one row');
  // The label slot, located by its own text, so this cannot pass by finding coral elsewhere.
  const label = /<span style="([^"]*)"[^>]*>DROPPED BY ADA<\/span>/.exec(markup);
  assert.ok(label, 'DROPPED BY ADA is not the whole text of one span — the meta row label slot has changed shape');
  assert.match(label[1], /color:var\(--cth-coral\)/,
    'DROPPED BY renders in the assignee\'s ink-500 whisper — rule R-2 changes the colour and nothing else, and the colour is the change');
  assert.match(label[1], /text-overflow:ellipsis/, 'the label slot lost its ellipsis, so a long name will break the 170px column');

  // …and how long ago, on the same row. One row, both facts.
  assert.equal(visibleText(ageElement(markup, 'updated ')), '4m', 'the released card renders no age beside DROPPED BY');

  // Rule R-1, asserted as an explicit negative: absence IS the rendering of "not known yet".
  // A placeholder is the only way the gap between write 1 and write 2 can look broken.
  for (const placeholder of ['…', '&hellip;', 'loading', 'Loading', 'unknown', 'Unknown', 'pending', 'skeleton']) {
    assert.ok(!markup.includes(placeholder),
      `the released card renders "${placeholder}" where the branch will go. Rule R-1 forbids every placeholder: if write 2 never lands (git failed; ADR-0003 keeps the work anyway) that placeholder is permanent and false`);
  }
  assert.match(markup, /title="Ada&#x27;s terminal exited at [^"]*\."/,
    "the card's title attribute does not name who dropped it and when");
  assert.doesNotMatch(markup, /title="[^"]*branch[^"]*"/,
    'the title claims a branch on a card whose second write has not landed');
});

test('VIGIL-02: the branch lives in the title attribute and the overlay, never in the card body', (t) => {
  const BRANCH = 'worker/ada/ship-the-release-drop-20260825';
  const released = { by: 'a1', at: ago(FOUR_MINUTES), branch: BRANCH, detail: 'uncommitted work preserved' };
  const card = html(React.createElement(TaskCard, kanbanCard(
    { status: 'todo', updatedAt: ago(FOUR_MINUTES), released }, { releasedByName: 'Ada' }
  )));

  assert.match(card, new RegExp(`title="[^"]*Their work is on branch ${BRANCH}\\.`),
    "the card's title attribute dropped the branch — rule R-3 puts it there and in the overlay, and nowhere else");
  assert.ok(!visibleText(card).includes(BRANCH),
    `the branch is rendered in the CARD BODY. TasksKanban.tsx states the board's own law verbatim — "a kanban card can carry a title at most" — and a worktree branch truncated into a 170px column is the looks-verifiable-but-is-not failure the UI-SPEC forbids`);

  // The overlay is where the full text lives. TaskDetail resolves released.by through the
  // store rather than through a prop, so its host (TaskDetailOverlay.tsx) needs no change.
  seedServerSnapshot(t, { agents: [agentRow()] });
  const task = kanbanTask({ status: 'todo', updatedAt: ago(FOUR_MINUTES), released });
  const overlay = html(React.createElement(TaskDetail, {
    task, all: [task], onMove: () => {}, onAssign: () => {}, onClose: () => {}
  }));

  assert.match(visibleText(overlay), new RegExp(`Their work is on branch ${BRANCH}\\.`),
    'the overlay does not carry the branch, so the full text exists nowhere a human can read it');
  assert.match(/<span style="([^"]*)"[^>]*>Their work is on branch/.exec(overlay)?.[1] ?? '', /word-break:break-all/,
    "the branch is not set to break-all — WorkersTab.tsx:161's shipped treatment of a worktree path exists because these strings have no spaces to wrap at");
  assert.match(visibleText(overlay), /Ada&#x27;s terminal exited at |Ada's terminal exited at /,
    'the overlay does not say whose terminal exited');
  assert.match(visibleText(overlay), /uncommitted work preserved/, "the overlay drops released.detail");

  // And with no branch, the overlay renders no placeholder either.
  const noBranch = kanbanTask({ status: 'todo', released: { by: 'a1', at: ago(FOUR_MINUTES) } });
  const bare = html(React.createElement(TaskDetail, {
    task: noBranch, all: [noBranch], onMove: () => {}, onAssign: () => {}, onClose: () => {}
  }));
  assert.match(visibleText(bare), /terminal exited at /, 'the overlay stopped reporting the release at all — the negative below would pass vacuously');
  assert.ok(!visibleText(bare).includes('branch'),
    'the overlay names a branch on a card whose second write has not landed (rule R-1)');
});

test('VIGIL-04: parseTasks carries updatedAt and released through its whitelist, and drops a half-written released', () => {
  const at = ago(FOUR_MINUTES);
  const [full, partial, garbage] = parseTasks({
    tasks: [
      { id: 'a', title: 'a', createdAt: at, updatedAt: at, released: { by: 'a1', at, branch: 'b', detail: 'd' } },
      { id: 'b', title: 'b', createdAt: at, released: { by: 'a1', at } },
      { id: 'c', title: 'c', createdAt: at, released: { at, branch: 42 } }
    ]
  });

  // parseTasks is a WHITELIST — a field it does not name is dropped, so the two new ones
  // would arrive at the card as undefined however correctly the writers stamp them.
  assert.equal(full.updatedAt, at, 'parseTasks drops updatedAt, so every card on the board would fall back to createdAt forever');
  assert.deepEqual(full.released, { by: 'a1', at, branch: 'b', detail: 'd' });
  assert.equal(partial.updatedAt, undefined, 'parseTasks invented an updatedAt — "never updated" is a fact the tooltip renders and must not be erased here');
  assert.deepEqual(partial.released, { by: 'a1', at, branch: undefined, detail: undefined },
    'the write-1 shape (no branch yet) does not survive parsing, so the card could never render between the two writes');
  assert.equal(garbage.released, undefined,
    'a released block with no `by` survives parsing — the ledger is a hand-written file, and that reaches the card as undefined.toUpperCase()');
});

// ─── VIGIL-04 — the ASK ME age, on the real board ────────────────────────────────────

/**
 * Render the REAL ASK ME board with real cards on it.
 *
 * `AskMeTab` fills its card list from `useHiveTasks()`, whose payload lives in one
 * module-level cache shared by the whole renderer (`useHiveTasks.ts:20`). A server render
 * runs NO effect phase, so the only way that cache is populated at first paint is to
 * populate it before rendering — which is what `refreshHiveTasks()` does, through
 * `window.cth.hiveTasks`.
 *
 * `window.cth` is the preload bridge (`src/preload/index.ts`), i.e. something the real
 * build already provides — the same category as the harness's `globalThis.self` shim, and
 * the same shape as TESTING.md's documented `require.cache` injection. It is NOT standing
 * in for a component, a prop or a derivation: the real `parse()`, the real `waitsOnHuman()`
 * and the real `recipientOf()` all run on the payload it delivers.
 *
 * `window` is installed and removed per test, never at module scope, because several
 * libraries in this process branch on `typeof window`.
 */
async function renderAskBoard(t, tasks) {
  const hadWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  globalThis.window = { cth: { hiveTasks: async () => ({ tasks }) } };
  t.after(() => {
    if (hadWindow) Object.defineProperty(globalThis, 'window', hadWindow);
    else delete globalThis.window;
  });
  refreshHiveTasks();
  // read() is async; one macrotask is enough for the awaited stub above to settle.
  await new Promise((resolve) => setImmediate(resolve));
  return html(React.createElement(AskMeTab));
}

const openAsk = (askedAt, extra = {}) => ({
  id: 'ask-1', title: 'approve the production key rotation', status: 'blocked',
  dependsOn: [], priority: 3, createdAt: ago(NINE_HOURS),
  humanQA: [{ q: 'which key should I rotate first?', ...(askedAt ? { askedAt } : {}) }], ...extra
});

test('VIGIL-04: every unanswered ASK ME question renders its age, between the title and the recipient badge', async (t) => {
  const markup = await renderAskBoard(t, [openAsk(ago(FOUR_MINUTES))]);

  // Positive lower bound FIRST (D-33/D-40): the board actually rendered the ask. Without
  // this, every assertion below would pass just as happily against an empty board.
  assert.match(visibleText(markup), /which key should I rotate first\?/,
    'the ASK ME board rendered no question at all, so nothing below is measuring the real surface');

  const age = ageElement(markup, 'asked ');
  assert.equal(visibleText(age), '4m', 'an unanswered ask renders no age — VIGIL-04 names asks explicitly, not just cards');

  // Rule A-4's placement, on the MARKUP rather than on the source: after the title button,
  // before the wrapper span that carries the recipient badge. The badge is located by its
  // own tooltip, the same one sendAnswer's recipient is derived from.
  const titleAt = markup.indexOf('which key should I rotate first?');
  const askTitleAt = markup.indexOf('approve the production key rotation');
  const ageAt = markup.indexOf('title="asked ');
  const badgeAt = markup.indexOf('your answer will be sent to');
  assert.ok(askTitleAt >= 0 && badgeAt >= 0, 'the header lost either its title button or its recipient badge — re-derive this anchor');
  assert.ok(askTitleAt < ageAt, 'the age renders BEFORE the task title — rule A-4 puts it after the title button, which is the element that gives up the width for it');
  assert.ok(ageAt < badgeAt, "the age renders after the recipient badge — rule A-4 inserts it immediately before the badge's wrapper span");
  assert.ok(badgeAt < titleAt, 'the question body now precedes the header, so the ordering assertions above are measuring the wrong region');

  assert.match(age, /flex-shrink:0/, 'the age can shrink, so a long task title will squeeze it to nothing instead of ellipsing itself');
});

test('VIGIL-04: a four-minute ask and a nine-hour ask differ on ALL FOUR channels, exactly as the cards do', async (t) => {
  const fresh = ageElement(await renderAskBoard(t, [openAsk(ago(FOUR_MINUTES))]), 'asked ');
  const stale = ageElement(await renderAskBoard(t, [openAsk(ago(NINE_HOURS))]), 'asked ');

  // 1 — unit letter
  assert.equal(visibleText(fresh), '4m');
  assert.equal(visibleText(stale), '9h');
  // 2 — colour
  assert.match(fresh, /color:var\(--cth-ink-500\)/, 'the fresh ask lost its ink-500 whisper treatment');
  assert.match(stale, /color:var\(--cth-ink-900\)/, 'a nine-hour ask is drawn no darker than a four-minute one');
  assert.doesNotMatch(fresh, /color:var\(--cth-ink-900\)/, 'a four-minute ask is already at ink-900, so the stale one cannot escalate past it');
  // 3 — weight
  assert.match(stale, /font-weight:600/, 'the stale ask is not bolder than the fresh one');
  assert.doesNotMatch(fresh, /font-weight:600/, 'a four-minute ask already renders at weight 600');
  // 4 — icon
  assert.ok(hasClock(stale), 'a nine-hour ask carries no clock icon — DESIGN.md:707 forbids colour alone, and this is the channel that survives a colour-blind operator');
  assert.ok(!hasClock(fresh), 'a four-minute ask shows the clock icon, so the icon says nothing');
});

test('VIGIL-04: an ask with no askedAt falls back to the card clock and SAYS which one it read', async (t) => {
  // `askedAt` is optional on the shared HumanQA shape and `openPhoneAsks` already guards
  // for its absence (`index.ts:1232`) — a hand-written god edit produces exactly this card.
  // Rendering `0s` for it would disguise a nine-hour-old ask as one that just arrived,
  // which is precisely the failure VIGIL-04 exists to make impossible (T-04-AGE-07).
  const markup = await renderAskBoard(t, [openAsk(undefined)]);

  assert.match(visibleText(markup), /which key should I rotate first\?/, 'the board rendered no ask, so the assertions below are vacuous');
  const age = ageElement(markup, 'asked ');
  assert.notEqual(visibleText(age), '0s',
    'an ask carrying no askedAt renders as brand new — a stale ask permanently disguised as a fresh one is the exact failure VIGIL-04 exists to prevent');
  assert.equal(visibleText(age), '9h', 'the fallback did not read the card clock');
  assert.match(markup, /the ask carries no timestamp/,
    'the tooltip does not name which clock it read, so "asked nine hours ago" cannot be told from "the card is nine hours old and the ask has no timestamp at all"');
});

// ─── PixelButton — the deny button's contrast (GATE-05 prerequisite) ─────────────────

/**
 * The `case '<variant>':` arm of PixelButton's palette switch, sliced by SYMBOL rather
 * than by line window. Every line number in that file moves the moment a variant is
 * added or a comment grows; the `case` label and the arm's closing `};` do not. Plan
 * 04-18 depends on this same boundary three waves later.
 */
function paletteCase(variant) {
  const src = fs.readFileSync(path.join(ROOT, 'src/renderer/src/components/PixelButton.tsx'), 'utf8');
  const start = src.indexOf(`case '${variant}':`);
  assert.notEqual(start, -1, `PixelButton no longer has a \`case '${variant}':\` arm — this assertion is reading nothing`);
  const end = src.indexOf('\n        };', start);
  assert.notEqual(end, -1, `the \`case '${variant}':\` arm has no closing \`};\` at the expected indent — the slice below would run to end-of-file`);
  return src.slice(start, end);
}

test('GATE-05: the destructive button paints its label with --cth-on-accent, the token that does NOT invert with the theme', () => {
  const markup = html(React.createElement(PixelButton, { variant: 'destructive' }, 'deny'));

  // The positive bound comes FIRST (D-33/D-40). Asserting only that `ink-900` is gone
  // would pass just as happily against a button that renders no colour at all, or no
  // button at all — which is the failure mode this whole file exists to catch.
  assert.equal(visibleText(markup), 'deny',
    'the destructive button rendered no label, so every colour assertion below is vacuous');
  assert.match(markup, /color:var\(--cth-on-accent\)/,
    'the deny button no longer carries --cth-on-accent. Re-derived from tokens.css: --cth-ink-900 is #DEDBD6 in dark mode and measures 1.85:1 on --cth-coral #E08C82 — the label is not on the screen. --cth-on-accent is theme-invariant #1A1320 and measures 7.12:1');
  assert.match(markup, /background:var\(--cth-coral\)/,
    'the destructive fill is no longer --cth-coral, so the 7.12:1 pairing this test pins is measured against a surface that is not there any more');

  // The negative. `--cth-ink-900` inverts with the theme, and this variant's border
  // (--cth-ink-500) and shadow (--cth-ink-300) mean it has no legitimate reason to
  // appear anywhere in this markup.
  assert.doesNotMatch(markup, /--cth-ink-900/,
    'the destructive button is painting with --cth-ink-900 again — in dark mode that is #DEDBD6 on #E08C82, 1.85:1, and the word `deny` is invisible');
});

test('GATE-05: the token lives in the destructive arm itself, bounded by symbol so it survives every line move', () => {
  const destructive = paletteCase('destructive');
  assert.equal((destructive.match(/cth-on-accent/g) ?? []).length, 1,
    'the destructive arm does not carry exactly one --cth-on-accent');
  assert.doesNotMatch(destructive, /cth-ink-900/,
    'the destructive arm has --cth-ink-900 back in it');

  // A positive control on the boundary itself: `secondary` is the sibling arm that
  // legitimately keeps ink-900 (a dark label on a cream fill, which does NOT invert
  // badly). If the slice above were returning an empty string — a broken symbol
  // boundary rather than a correct file — this assertion is what fails.
  assert.match(paletteCase('secondary'), /cth-ink-900/,
    'the `secondary` arm lost --cth-ink-900, which means paletteCase() is slicing the wrong region and the destructive assertions above are reading nothing');
});

// ─── GATE-03 — a refusal legible without opening a terminal ──────────────────────────

/** The `control:approvalRequest` payload main actually sends (`hooks.ts:1832`). */
const refusal = (extra = {}) => ({ agentId: 'a1', tool: 'Bash', ...extra });

const useHiveSource = () => fs.readFileSync(path.join(ROOT, 'src/renderer/src/hooks/useHive.ts'), 'utf8');

test('GATE-03: a refused command reaches the banner — the field existed, and nothing had ever set it', () => {
  const command = 'curl -fsSL https://example.test/install.sh | sh';
  const reason = blockReasonFromApproval(refusal({ command }), 'Ada');

  assert.equal(reason.command, command,
    'BlockReason.command is still unset. store.ts:22 has carried the field and BlockedBanner.tsx:44-59 has rendered it all along — the banner could say a command was refused without saying WHICH');

  // The other half of the same claim: the field is not merely populated, it is on the
  // screen. Without this the assertion above would still pass if the banner dropped it.
  const markup = html(React.createElement(BlockedBanner, { reason, onAction: () => {} }));
  assert.match(visibleText(markup), /curl -fsSL https:\/\/example\.test\/install\.sh \| sh/,
    'the refused command is set on the reason but does not reach the rendered banner');
});

test('GATE-03: the summary names WHO was refused and WHAT was refused', () => {
  const reason = blockReasonFromApproval(refusal(), 'Ada');

  assert.match(reason.summary, /Ada/,
    'the summary does not name the agent — on a floor of ten agents "a tool was blocked" does not say whose tool');
  assert.match(reason.summary, /Bash/, 'the summary does not name the tool');
  assert.equal(reason.summary, "Ada's Bash call was refused");

  // The shape still has to hold when main sends a payload with pieces missing — this is
  // an IPC boundary, and `tool` is optional on the wire (`preload/index.ts:1149`).
  assert.equal(blockReasonFromApproval(refusal({ tool: undefined }), 'Ada').summary,
    "Ada's tool call was refused", 'a payload with no tool name produces a malformed sentence');
  assert.equal(blockReasonFromApproval(refusal(), undefined).summary,
    'A Bash call was refused', 'an unresolvable agent produces a sentence starting with "undefined"');
});

test("GATE-03 rule D-1: main's reason is rendered byte-for-byte, never paraphrased", () => {
  // A real one, from the strings main authors beside the gate that decided it.
  const reason = 'Refused: a heredoc that writes into .git/hooks would run on the next commit.';
  const built = blockReasonFromApproval(refusal({ reason }), 'Ada');

  assert.equal(built.detail, reason,
    "the renderer rewrote main's sentence — rule D-1 exists because a renderer-authored copy drifts and then confidently describes a rule that no longer exists");
});

test('GATE-03 rule D-1: with no reason from main, the fallback is bare — the renderer invents nothing', () => {
  const built = blockReasonFromApproval(refusal(), 'Ada');

  assert.equal(built.detail, 'Refused by the floor.',
    'the no-reason fallback is not the bare sentence');
  // The negative that matters, and its positive bound is the equality above: the old
  // fallback named a mechanism ("ungate it from the Command Center") that the operator
  // may not have, on a refusal main never explained.
  assert.doesNotMatch(built.detail, /ungate|operator policy|Command Center/,
    'the renderer is inventing an explanation for a refusal main did not explain');
});

test('GATE-03 rule D-1: the invented sentence is gone from the source, not merely unreachable', () => {
  assert.doesNotMatch(useHiveSource(), /Denied by operator policy/,
    'the old renderer-authored denial reason is still in useHive.ts');
});

// ─── GATE-05 — an ASK is not a notice, and the difference is one field ────────────────
//
// `blockReasonFromApproval` is the SHIPPED assembly (it runs inside a useEffect, and this
// harness has no effect phase — see the ceiling at :23-38), so these call it directly for
// the same reason the GATE-03 cases above do.

/** A GATE-05 ask payload as `control:approvalRequest` now delivers it. */
const askPayload = (extra = {}) => ({
  agentId: 'a1', tool: 'Bash', command: 'git push origin +main --force',
  reason: 'Refused: this command FORCE-pushes to a git remote.',
  askId: 'ask-0123456789abcdef0123456789abcdef', expiresInMs: 120_000, ...extra
});

test('GATE-05: an ask carries its id, its DURATION and the anchor the countdown is derived from', () => {
  const built = blockReasonFromApproval(askPayload(), 'Ada', 1_700_000_000_000);

  assert.equal(built.askId, 'ask-0123456789abcdef0123456789abcdef',
    '`askId` did not survive the assembly — it is the discriminator AND the capability, and without it the answer has nothing to name');
  assert.equal(built.expiresInMs, 120_000, 'the server-measured duration was dropped');
  assert.equal(built.receivedAt, 1_700_000_000_000,
    'the renderer did not stamp WHEN it received the ask. The countdown is `receivedAt + expiresInMs - now`; without the anchor it has nothing to re-derive from and the only alternative is a decremented counter, which drifts optimistically in a backgrounded window');
});

test('GATE-05: an ask renders TWO answerable actions and NO keystrokes — ADR-0001 is structural here', () => {
  const built = blockReasonFromApproval(askPayload(), 'Ada');

  assert.deepEqual(built.actions.map((a) => [a.label, a.kind]), [['approve', 'approve'], ['deny', 'deny']],
    'an ask rendered the notice shape (`actions: []` plus `dismiss`) — the operator is shown a question they cannot answer while the shim sits on its poll loop until the TTL denies it');

  // ADR-0001: exactly one place types into a live PTY, and this is not it. `send` is what
  // BlockedBanner's two callers forward to `writePty`; leaving it undefined makes the PTY
  // path UNREACHABLE for an ask rather than merely unused, so a future edit to either
  // caller cannot resurrect a second typer by accident.
  for (const a of built.actions) {
    assert.equal(a.send, undefined,
      `the ${a.label} action carries keystrokes. The answer rides the approval IPC to ApprovalRegistry.answer and the hook return — never a second PTY typer (ADR-0001)`);
  }

  // The two labels are the SAME two literals `answerToolAsk` allowlists in main
  // (index.ts:1323) — `approve` → true, `deny` → false, anything else → no answer at all.
  // One vocabulary across the phone and the desktop, so an unrecognised label can never
  // become an accidental yes on the channel whose whole point is an explicit yes.
  assert.deepEqual(built.actions.map((a) => a.label), ['approve', 'deny']);
});

test('GATE-05: a notice is untouched — no id, no duration, no actions, and it still dismisses', () => {
  // The paired negative. Two of the three assertions above would pass just as well
  // against an assembly that made EVERY refusal answerable, which is the worse failure:
  // approve/deny buttons on a call the floor already denied settle nothing at all.
  const built = blockReasonFromApproval(refusal({ command: 'rm -rf build' }), 'Ada');

  assert.equal(built.askId, undefined, 'a GATE-03 notice was given an ask id');
  assert.equal(built.expiresInMs, undefined, 'a GATE-03 notice was given a countdown');
  assert.deepEqual(built.actions, [], 'a GATE-03 notice grew answer buttons that can settle nothing');

  const markup = html(React.createElement(BlockedBanner, { reason: built, onAction: () => {} }));
  assert.match(visibleText(markup), /dismiss/, 'the notice lost the only control that closes it');
});

test('GATE-05: the summary says the ask is WAITING, not that it was refused', () => {
  const built = blockReasonFromApproval(askPayload(), 'Ada');

  assert.match(built.summary, /Ada/, 'the summary does not name the agent');
  assert.doesNotMatch(built.summary, /refused/i,
    'an OPEN question is headlined as a refusal. It has not been refused — it is waiting on the operator, and it auto-denies in two minutes if they read that headline and move on');

  // Rule D-1 still binds on the DETAIL: main's sentence, byte for byte. Only the
  // renderer-authored sentence SHAPE differs between the two kinds.
  assert.equal(built.detail, 'Refused: this command FORCE-pushes to a git remote.',
    "main's own sentence was rewritten — rule D-1 does not stop applying because the reason arrived on an ask");
});

// ─── GATE-05 — the countdown's rule table, as a pure function ─────────────────────────
//
// The one part of this surface that is a pure function of a number, so the one part that
// gets real coverage instead of a checkpoint. Everything else about the countdown — that
// it TICKS — needs an effect phase this harness does not have (:23-38), and is a task-4
// acceptance criterion rather than a silence here.

test('GATE-05 rule G-3: formatRemaining renders all five bands, and escalates on the last three', () => {
  assert.deepEqual(formatRemaining(124_000), { text: '2m 04s left', escalate: false },
    '>= 60s must render minutes with a ZERO-PADDED seconds field — `2m 4s left` is a different string from the one the phone renders and the cross-check in build-assets.test.cjs reddens on it');
  assert.deepEqual(formatRemaining(45_000), { text: '45s left', escalate: false },
    '10-59s is a bare seconds count, and two thirds of the ask is not an emergency');
  assert.deepEqual(formatRemaining(30_000), { text: '30s left', escalate: true },
    'at 30s the countdown must ESCALATE. This is the threshold the whole ink ramp exists for: below it the operator has to decide now, and the banner has to say so on more than one channel');
  assert.deepEqual(formatRemaining(9_000), { text: 'expiring — will deny', escalate: true },
    'below 10s NO NUMBER is shown — the last ten seconds are the window where clock skew and transit latency could lie, and a number that lies there tells the operator they have time to answer a question that has already auto-denied. `— will deny` is the half that says what the timeout DOES');
  assert.deepEqual(formatRemaining(0), { text: 'expired', escalate: true });
  assert.deepEqual(formatRemaining(-1), { text: 'expired', escalate: true },
    'a negative remainder must read `expired`, never a negative countdown');

  // The boundary belongs to the number, exactly as it does on the phone: 10_000
  // renders `10s left`, not `expiring`.
  assert.equal(formatRemaining(10_000).text, '10s left',
    'the 10s boundary fell into the no-number band — the phone puts it on the number side and the two must not disagree');
  // 31s is the OTHER side of the escalation threshold, and without it `escalate`
  // could be a constant true above 10s.
  assert.equal(formatRemaining(31_000).escalate, false,
    'the escalation has no upper edge — everything above 30s is escalating, so nothing is');
});

// ─── GATE-05 — the banner, on the markup the operator actually sees ───────────────────

/** A resolved-or-live ask reason for BlockedBanner. */
const askReason = (extra = {}) => ({
  ...blockReasonFromApproval(askPayload(), 'Ada', 1_000_000),
  ...extra
});

/**
 * The countdown span's inline style.
 *
 * This file's house rule is "assert semantics, never markup strings" (:41-47), and this
 * is the one deliberate exception in it. The rule the criterion enforces is a MEASURED
 * contrast ratio — `--cth-coral` on the banner's `--cth-coral-light` fill is 2.43:1 in
 * light mode, a fail, while `--cth-ink-900` is 12.96:1 — and a colour token has no
 * accessible name, no role and no visible text to be asserted through. T-04-ASK-23 is
 * "a countdown unreadable exactly when it matters", so the token IS the property.
 * Located by `margin-left:auto`, which the countdown is the only element in the banner
 * to carry (it is the row's right-aligned member), never by ordinal position.
 */
const countdownStyle = (markup) => {
  const m = markup.match(/<span style="([^"]*margin-left:auto[^"]*)"/);
  assert.ok(m, 'no right-aligned countdown span in the banner markup at all');
  return m[1];
};

test('GATE-05 rule 1: the countdown escalates on the INK ramp, and never to coral', () => {
  const live = html(React.createElement(BlockedBanner, {
    reason: askReason({ receivedAt: Date.now(), expiresInMs: 31_000 }), onAction: () => {}
  }));
  const urgent = html(React.createElement(BlockedBanner, {
    reason: askReason({ receivedAt: Date.now(), expiresInMs: 30_000 }), onAction: () => {}
  }));

  assert.match(countdownStyle(live), /--cth-ink-700/,
    'the un-escalated countdown is not on ink-700 (8.89:1 light / 6.47:1 dark on the banner fill)');
  assert.doesNotMatch(countdownStyle(live), /font-weight:600/,
    'the countdown is already at weight 600 at 31s, so the escalation at 30s carries no weight channel at all');

  assert.match(countdownStyle(urgent), /--cth-ink-900/,
    'at 30s the countdown did not move to ink-900 (12.96:1 / 10.13:1) — this is the moment it most has to be readable');
  assert.match(countdownStyle(urgent), /font-weight:600/,
    'the escalation is colour-only. DESIGN.md:707: colour + icon + position, never colour alone');

  // The negative that T-04-ASK-23 is actually about, in BOTH states, with its
  // positive control in the same case: the banner's own fill IS --cth-coral-light
  // and must still be there, so an empty render cannot satisfy this.
  for (const [name, markup] of [['31s', live], ['30s', urgent]]) {
    assert.doesNotMatch(countdownStyle(markup), /cth-coral/,
      `the ${name} countdown paints itself coral. --cth-coral on --cth-coral-light measures 2.43:1 in LIGHT mode — a fail — so the countdown would become unreadable at exactly the moment it matters`);
    assert.match(markup, /--cth-coral-light/,
      'the banner lost its own coral fill — the positive control for the negative above');
  }
});

test('GATE-05: the clock icon rides the ask and nothing else', () => {
  const ask = html(React.createElement(BlockedBanner, { reason: askReason(), onAction: () => {} }));
  const notice = html(React.createElement(BlockedBanner, {
    reason: blockReasonFromApproval(refusal({ command: 'rm -rf build' }), 'Ada'), onAction: () => {}
  }));

  // Counted, not merely matched: the bell is already an <svg> in this banner, so
  // "an svg is present" would pass on a render with no clock at all.
  const svgs = (m) => (m.match(/<svg/g) ?? []).length;
  assert.equal(svgs(ask), 2, 'the ask render is missing the countdown clock beside the bell');
  assert.equal(svgs(notice), 1, 'a GATE-03 notice grew a clock — there is nothing counting down on a call that was already denied');
});

test('GATE-05 rule 3: a command under approval is NEVER ellipsised; a notice keeps its ellipsis AND gains a tooltip', () => {
  const command = 'git push origin +main --force';
  const ask = html(React.createElement(BlockedBanner, { reason: askReason(), onAction: () => {} }));
  const notice = html(React.createElement(BlockedBanner, {
    reason: blockReasonFromApproval(refusal({ command }), 'Ada'), onAction: () => {}
  }));

  // `git push origin +ma…` hides the dangerous half, and the dangerous half is
  // frequently at the end. Under approval the block wraps and scrolls instead.
  assert.doesNotMatch(ask, /text-overflow:ellipsis/,
    'the command awaiting approval is still ellipsised — the operator is being asked to authorise a string they cannot fully read');
  assert.match(ask, /white-space:pre-wrap/, 'the command block does not wrap');
  assert.match(ask, /word-break:break-all/, 'a single unbroken token (a long URL, a base64 blob) would still overflow');
  assert.match(ask, /max-height:96px/, 'the block is unbounded, so a heredoc pushes the answer buttons off screen');
  assert.match(ask, /overflow-y:auto/, 'the block is capped but not scrollable, so anything past 96px is unreachable');

  // The GATE-03 half is UNCHANGED behaviour plus plan 04-14's deferred rider:
  // that command already did not run, so the ellipsis is fine — but the full
  // string must be one hover away rather than only in the terminal feed.
  assert.match(notice, /text-overflow:ellipsis/, "the notice's ellipsis was removed — this direction was not asked for and costs vertical space on a banner that is not a prompt");
  assert.match(notice, new RegExp(`title="${command.replace(/[+]/g, '\\+')}"`),
    'the notice command has no `title` — plan 04-14 deferred this rider here because D-35 forbade it that file, and without it the truncated half is readable nowhere in the UI');
});

test('GATE-05 rule 4: a resolved ask keeps its banner, shows an outcome, and offers dismiss', () => {
  // The post-resolution SHAPE, which is prop-driven and therefore visible to a
  // server render. What is NOT asserted here, and is named so nobody mistakes
  // the silence for coverage: that a CLICK produced this shape, and that focus
  // moved to `dismiss`. There is no `document` in this harness and no events
  // fire (:23-38) — both are task-4 acceptance criteria.
  const resolved = html(React.createElement(BlockedBanner, {
    reason: askReason({ actions: [], outcome: 'approved — the command was allowed to run' }),
    onAction: () => {}
  }));

  assert.match(resolved, /--cth-coral-light/,
    'the banner vanished on resolution. A banner that silently disappears leaves the operator unable to tell whether they approved something (T-04-ASK-24)');
  assert.match(visibleText(resolved), /approved — the command was allowed to run/,
    'the outcome line is missing, so the banner is still mounted and says nothing about what happened');
  assert.match(visibleText(resolved), /dismiss/,
    'the resolved banner has no control that closes it');
  assert.doesNotMatch(visibleText(resolved), /approve\b(?!d)/,
    'the action row survived resolution — the operator can click approve on an ask that is already settled');

  // A resolved ask stops counting: `expiring — will deny` beside `approved` is a
  // sentence the operator has to reconcile at 3am.
  assert.doesNotMatch(resolved, /margin-left:auto/,
    'the countdown is still rendered on a settled ask');
});

test('GATE-05 rule G-2: the outcome line says WHICH way a failed answer went', () => {
  // The two failures are opposites at 3am. `expired` means the floor already denied
  // and nothing ran; `settled` means somebody else answered and it may have run. One
  // "could not answer" line for both is the message that leaves the operator unable
  // to act, which is the whole reason main returns the distinction.
  assert.match(askOutcomeText(true, { settled: true }, false), /approved/);
  assert.match(askOutcomeText(false, { settled: true }, false), /denied/);
  assert.doesNotMatch(askOutcomeText(false, { settled: true }, false), /did run|was allowed/,
    'a DENY reported that the command ran');

  assert.match(askOutcomeText(true, { settled: false, expired: true }, false), /expired/,
    "main said the ask expired and the banner did not pass that on — the operator cannot tell a denied command from one that may have run");
  assert.match(askOutcomeText(true, { settled: false, expired: false }, false), /elsewhere/,
    'an ask settled on another surface is reported as an expiry, which claims the command did not run when it may well have');

  // The renderer's OWN reading wins on a desktop-only floor: `toolAskExpiry` in main is
  // filled by phone GETs, so `expired` is false there for a genuinely expired ask. Either
  // source saying expired is enough; requiring both would report the safe outcome as the
  // unsafe one exactly where the phone is not in play.
  assert.match(askOutcomeText(true, { settled: false, expired: false }, true), /expired/,
    "the renderer ignored its own anchor. Main's expired flag reads false for any ask no phone GET memoised, so on a desktop-only floor this is the ONLY honest source");

  // A dead IPC is neither: the ask was not touched, and saying so is the only
  // statement that is true.
  assert.match(askOutcomeText(true, null, false), /could not reach the floor/,
    'a failed IPC was reported as an outcome — the ask is still open and the operator has been told it is not');
});

test('GATE-05: BOTH banner call sites route through the shipped ask decision, so the cases above are not asserting a copy', () => {
  for (const rel of [
    'src/renderer/src/components/AgentDetailPanel.tsx',
    'src/renderer/src/components/CommandCenterPanel.tsx'
  ]) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.match(src, /if \(answerAskFromBanner\(agent, label\)\) return;/,
      `${rel} no longer routes an ask through answerAskFromBanner — a second copy of a security branch is how two surfaces come to disagree about it`);
    // ...and the PTY path it guards is STILL THERE for the non-ask reasons it was
    // written for. T-04-ASK-21 is a grep gate on these two files precisely so that
    // "the ask does not type" cannot be satisfied by deleting the typer.
    assert.match(src, /window\.cth\.writePty\(agent\.ptyId, send\)/,
      `${rel} lost its writePty path entirely — the GATE-03/pty-parser reasons this banner was built for now do nothing`);
  }
});

// ─── VIGIL-03 — a blocked agent is visibly blocked, even under a tripped breaker ──────

const ccpSource = () => fs.readFileSync(path.join(ROOT, 'src/renderer/src/components/CommandCenterPanel.tsx'), 'utf8');

/** One roster row's badge, rendered exactly as the Command Center renders it. */
const rosterBadge = (status, armed) =>
  visibleText(html(React.createElement(PixelBadge, { status: rosterBadgeStatus(status, armed) })));

test('VIGIL-03: a blocked agent reads `needs you` on the roster even while the circuit breaker is armed', () => {
  // All FOUR cases, because two of them would pass just as well against an expression
  // that ignores `armed` entirely — and the armed pair is the whole point.
  assert.equal(rosterBadge('blocked', true), 'needs you',
    'a blocked agent reads `looping` under a tripped breaker. That badge is the row\'s only blocked signal, and VIGIL-03\'s criterion is that an agent blocked on a prompt is VISIBLY blocked — at 3am the operator can act on `needs you` and cannot act on `looping`');
  assert.equal(rosterBadge('working', true), 'looping',
    'the armed state was weakened in general — a working agent under a tripped breaker must still read `looping`');
  assert.equal(rosterBadge('blocked', false), 'needs you',
    'the unarmed blocked row regressed');
  assert.equal(rosterBadge('working', false), 'working',
    'the unarmed working row regressed');
});

test('VIGIL-03: the roster badge site calls the shipped rule, so the four cases above are not asserting a copy', () => {
  assert.match(ccpSource(), /<PixelBadge status=\{rosterBadgeStatus\(a\.status, armed\)\} \/>/,
    'the Command Center roster no longer routes its badge through rosterBadgeStatus, so the four cases above are testing a function nothing renders');
});

test("VIGIL-03: the armed row keeps its other two channels, so `blocked` winning is a strict improvement and not a trade", () => {
  const src = ccpSource();
  // Channel 2 — the row fill. Channel 3 — the ⚠ glyph (asserted verbatim below).
  // DESIGN.md:707: "colour + icon + position … never colour alone".
  assert.match(src, /background: armed \? 'var\(--cth-coral-light\)' : 'var\(--cth-paper-100\)'/,
    'the armed row lost its --cth-coral-light fill — with the badge now able to say `needs you`, that fill is one of the two channels left saying the breaker is armed');
  assert.equal((src.match(/'paused'/g) ?? []).length, 1,
    'the `paused` count moved. PixelBadge has no `paused` StatusKind (PixelBadge.tsx:3-12) and none was to be invented; the one legitimate occurrence is the floor-delivery label at :213');
});

test("T-04-BLK-10: the breaker's ⚠ is ANNOUNCED on the one row where the badge stopped saying it", () => {
  // WHY THIS IS ASSERTED ON SOURCE AND NOT ON MARKUP, stated rather than left as a
  // silence. `armed` is derived from `breakers`, which is `useState({})` inside
  // `useFleetTelemetry` and is filled only by an effect — and this harness runs no
  // effect phase at all (:23-38). A rendered CommandCenterPanel therefore has
  // `armed === false` for every row and BOTH branches below are unreachable through
  // it. That is the same measured fact that made plan 04-14 export
  // `rosterBadgeStatus`; here the glyph cannot be extracted the same way, because its
  // `fontSize: 12` is pinned verbatim by FLOOR-12's allowlist and moving it out of
  // that line would redden two clauses in repo-claims.test.cjs. So: the shape is
  // asserted where it lives.
  const src = ccpSource();

  const DECOR = "{armed && a.status !== 'blocked' && <span aria-hidden=\"true\" title={breaker?.reason} style={{ color: 'var(--cth-coral)', fontSize: 12 }}>⚠</span>}";
  const SPOKEN = "{armed && a.status === 'blocked' && <span role=\"img\" aria-label={`circuit breaker: ${breaker?.reason ?? 'armed'}`} style={{ color: 'var(--cth-coral)' }}>⚠</span>}";

  // The decorative branch is BYTE-IDENTICAL to what shipped, plus its new guard —
  // `repo-claims.test.cjs`'s FLOOR-12 entry pins this exact text with `count: 1`, and
  // that entry moved in the same commit as this line.
  assert.equal(src.split(DECOR).length - 1, 1,
    'the decorative ⚠ branch no longer matches the text FLOOR-12 pins verbatim. Two clauses redden on this, and the fix is NOT to widen that allowlist (repo-claims.test.cjs says so in its own failure message) — it is to restore the line');

  assert.equal(src.split(SPOKEN).length - 1, 1,
    'the armed+blocked ⚠ is not announced. A `title` on an `aria-hidden` span reaches nobody, and since plan 04-14 made the badge read `needs you` on this row the glyph is the ONLY armed signal an AT operator has left (T-04-BLK-10)');

  // The two guards are exhaustive and mutually exclusive over `armed`: the glyph can
  // neither vanish under a tripped breaker nor render twice on one row. Asserted from
  // the guards themselves, because a rendered panel cannot reach either branch.
  assert.equal((src.match(/\{armed && a\.status [!=]== 'blocked' &&/g) ?? []).length, 2,
    'the ⚠ no longer splits on exactly `armed && a.status (!==|===) blocked` — a third guard, or a dropped one, means a row that shows two glyphs or none');

  // The spoken branch is not merely present, it is CORRECTLY shaped: no aria-hidden
  // (which would silence it again), and the label carries main's own breaker reason
  // rather than a renderer-authored sentence.
  assert.doesNotMatch(SPOKEN, /aria-hidden/,
    'the announced branch kept aria-hidden, so the swap changed nothing an AT operator can hear');
  assert.match(SPOKEN, /aria-label=\{`circuit breaker: \$\{breaker\?\.reason/,
    'the announced branch does not name WHY the breaker tripped — "circuit breaker" alone is the same non-information the badge already carries');

  // FLOOR-12's cost, asserted so it cannot silently become a numeric override later:
  // the announced branch has no inline fontSize at all. Clause 3 walks back from every
  // sub-14px site to its owning open tag and demands a LITERAL aria-hidden, which this
  // branch by definition cannot have — so a 12px override here would be both
  // unallowlistable and unfixable. The glyph inherits ~14px on this one row.
  assert.doesNotMatch(SPOKEN, /fontSize/,
    'the announced ⚠ took an inline fontSize. If it is sub-14px, FLOOR-12 clause 3 fails on it and no allowlist entry can rescue it; --cth-text-body-sm is 14px (tokens.css:71), not 12');
});

// ─── VIGIL-01 — the QUIET chip, and the latch it mirrors ──────────────────────────────
//
// THE CHIP ITSELF IS NOT RENDERED HERE, and the reason is measured rather than assumed:
// `App.tsx:292` reads `import.meta.env.DEV`, and this harness transpiles to CommonJS —
// `loadTs('src/renderer/src/App.tsx')` throws `Cannot use 'import.meta' outside a module`
// before any component is reached. That is a property of the file, not of the chip, and
// no amount of seeding gets past it. So the chip's DRIVER is asserted behaviourally (the
// store mirror, both directions, which is exactly what its `{floorQuiet && …}` guard
// reads) and its SHAPE is asserted on source. Its click is task 4's, for the same reason
// every other click in this file is.

const appSource = () => fs.readFileSync(path.join(ROOT, 'src/renderer/src/App.tsx'), 'utf8');

test('VIGIL-01: the store field is a MIRROR of main\'s latch — both edges, including the clearing one', (t) => {
  const before = useStore.getState().floorQuiet;
  t.after(() => useStore.setState({ floorQuiet: before }));

  assert.equal(useStore.getState().floorQuiet, null,
    'the quiet latch does not start null. A stale "the floor stopped" chip on a floor that is moving is the one failure this mirror must not be capable of');

  const snap = { sinceMs: 1_920_000, inFlight: [{ id: 't1', title: 'ship the thing', assignee: 'ada' }], godDead: false };
  useStore.getState().setFloorQuiet(snap);
  const set = useStore.getState().floorQuiet;
  assert.ok(set, 'the setting edge did not reach the store, so the chip has no route to the snapshot at all (T-04-ABS-10)');
  assert.equal(set.sinceMs, 1_920_000, "main's duration was dropped");
  assert.deepEqual(set.inFlight, snap.inFlight,
    'the in-flight set was dropped — "with what was in flight when it stopped" is the requirement, and re-reading the board later reports a different, possibly empty, set');
  assert.ok(typeof set.receivedAt === 'number' && set.receivedAt > 0,
    "the renderer did not stamp its own anchor. `sinceMs` is a duration at the moment of ONE push; without a local zero the label freezes at the value main happened to send");

  // The clearing edge. Plan 04-11 publishes `null` rather than leaving the last
  // snapshot in place precisely so this is expressible, and a mirror that can only
  // be set is a chip that never goes away.
  useStore.getState().setFloorQuiet(null);
  assert.equal(useStore.getState().floorQuiet, null,
    'the clearing edge left the last snapshot in place — the chip would still be claiming the floor is stopped after it started moving again');
});

test('VIGIL-01 rules Q-2/Q-3: the chip is a button, it opens the task board, and it renders only while the latch is set', () => {
  const src = appSource();

  // Q-3 — a STATE, not a repeat notification: guarded on the mirror, so it exists
  // while the latch is set and disappears when it clears. Both directions come from
  // this one guard plus the store test above.
  assert.match(src, /\{floorQuiet && \(/,
    'the QUIET chip is not guarded on the store mirror — a chip that always renders and a chip that never renders both pass every other assertion here');

  // Q-2 — a <button>, and the action it fires was READ FROM SOURCE, not assumed:
  // `OfficeFloor.tsx:1106` is the shipped task-board click and this copies it,
  // including the ORDER (select() sets ccTabRequest: null, so requesting first and
  // selecting second would clear the request it just made).
  assert.match(src, /st\.requestCommandCenterTab\('tasks'\);/,
    "the chip does not open the task board through the store action the office board already uses — VIGIL-01 composes with VIGIL-04 rather than growing a surface of its own");
  assert.ok(
    src.indexOf('if (god) st.select(god.id);') < src.indexOf("st.requestCommandCenterTab('tasks');"),
    'the chip requests the Command Center tab BEFORE selecting the god. `select()` sets ccTabRequest to null, so that order clears the request it just made and the click does nothing');

  // A1 — the visible `QUIET 32m` names neither what is quiet nor what clicking does.
  assert.match(src, /aria-label=\{`Floor quiet for \$\{quietFor\} — \$\{floorQuiet\.inFlight\.length\}/,
    "the chip's accessible name does not carry the duration and the in-flight count");
});

test('VIGIL-01: the QUIET chip copies the PUBLIC chip field for field, changing only the background', () => {
  // Geometry, not taste: two chips in one 36px strip that disagree about padding or
  // flexShrink degrade differently, and the containment measurement is only valid for
  // the geometry it was taken against.
  const src = appSource();
  const chip = (bg) => {
    const at = src.indexOf(`background: 'var(${bg})', color: 'var(--cth-on-accent)'`);
    assert.ok(at >= 0, `no titlebar chip with a ${bg} fill`);
    return src.slice(at, src.indexOf('}}', at));
  };
  const publicChip = chip('--cth-lemon');
  const quietChip = chip('--cth-coral');

  assert.equal(
    quietChip.replace('--cth-coral', '--cth-lemon'), publicChip,
    'the QUIET chip has drifted from the PUBLIC chip on something other than its background. The two share one 36px strip and one measurement; a padding or flexShrink that differs makes the containment probe describe a layout that is not on screen'
  );
  // --cth-on-accent on --cth-coral is 5.34:1 light / 7.12:1 dark, both PASS — an
  // already-measured pairing, which is why this chip needed no new colour work.
  assert.match(quietChip, /color: 'var\(--cth-on-accent\)'/,
    'the chip lost the token that does NOT invert with the theme, so its label goes unreadable in one of the two modes');
});

test('GATE-03 rule D-2: the terminal feed line survives — it is the audit trail, not a duplicate', () => {
  // The requirement is that the operator does not HAVE to read a terminal, not that the
  // trail is deleted. Counted rather than merely matched: a second ⛔ push would mean the
  // feed is being written twice per refusal.
  assert.equal((useHiveSource().match(/⛔/g) ?? []).length, 1,
    'the ⛔ feed push was dropped or duplicated — D-2 keeps exactly the one that was already there');
});

// ─── DayBandTab — SCALE-03's day band (03-UI-SPEC §S1) ───────────────────────────────

/**
 * WHY THESE CASES PASS DATA IN AS A PROP.
 *
 * The band's data comes from `hive:timeline`, and this harness has no effect phase at all
 * (the ceiling at :23-38). A component that only ever fetches therefore renders with an
 * EMPTY summary on the one pass a test can observe — every count, every gap sentence and
 * the truncation line below would "pass" against markup that contains none of them, or
 * force a downgrade to grepping the source, which proves a string exists in the file and
 * not that any branch renders it.
 *
 * `DayBandTab` takes the FULL discriminated result as an optional prop the production
 * mount never passes: `{ok:true,…}` and `{ok:false,error}` alike. Injecting the failure
 * half is the whole point — an `ok:false` day is the one state that MUST NOT render as a
 * quiet one, and without the seam that branch is unreachable from a first-pass render.
 */

const BUCKET_MS = 15 * 60 * 1000;

/** Local midnight for a 'YYYY-MM-DD' day — the same resolution `timeline.ts`'s
 *  `parseDayParam` does main-side, so a fixture's timestamps land where main would. */
function localDayStart(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

function todayLocal() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

/** 96 columns, exactly the shape `summarizeDay` builds before it counts anything. */
function bandBuckets(day, fill = {}) {
  const start = localDayStart(day);
  return Array.from({ length: 96 }, (_, i) => ({
    index: i, startMs: start + i * BUCKET_MS,
    events: 0, envelopes: 0, usd: 0, tokens: 0, ...(fill[i] ?? {})
  }));
}

const band = (props) => html(React.createElement(DayBandTab, props));

/** React escapes `'`, `"` and `&` in BOTH text nodes and attributes, so a sentence
 *  carrying an apostrophe never appears verbatim in raw markup. Decode before asserting
 *  on copy — otherwise the assertion is about React's escaper, not about the sentence. */
const decode = (s) => s
  .replace(/&#x27;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** The SVG's accessible name, read out of the ATTRIBUTE rather than the visible text: a
 *  reason that reaches the page but not ARIA strands the screen-reader user, and only
 *  reading the attribute can tell the two apart. */
function ariaLabelOf(markup) {
  const m = /<svg[^>]*\saria-label="([^"]*)"/.exec(markup);
  assert.ok(m, 'the band rendered no <svg> carrying an aria-label — QrCode.tsx:50-67 is the precedent this copies, and without the name the band is an unlabelled graphic');
  return decode(m[1]);
}

const QUIET = '2026-08-20';

test('DayBandTab draws the day as ONE accessible SVG of rects — no canvas, no <text>, no Pixi', () => {
  const markup = band({
    day: QUIET,
    summary: {
      ok: true, firstTs: localDayStart(QUIET) - 86_400_000, eventsAgedOut: false,
      buckets: bandBuckets(QUIET, { 40: { events: 12, envelopes: 5, usd: 0.42, tokens: 900 } })
    }
  });

  assert.ok(!markup.includes('<canvas'),
    'the band rendered a <canvas> — D-28 refuses a second WebGL context on this surface on a measured bug (glRecovery.ts:9-18), and the office floor is always first out of Chromium\'s ~16-context cap');
  assert.ok(!/<text[\s>]/.test(markup),
    'the band put a <text> element inside the SVG — S1b puts the axis and legend in DOM precisely so they stay selectable, translatable and scalable');
  assert.match(ariaLabelOf(markup), /^Activity for 2026-08-20: 12 events, 5 envelopes, \$0\.42 across 96 fifteen-minute buckets\./,
    'the band\'s accessible name is not S1b\'s summary string — a screen-reader user gets an unlabelled graphic instead of the day');

  // Counted against a day where every column HAS something, because S1b's encoding is
  // "zero draws nothing" — counting rects on the sparse fixture above would assert the
  // opposite of the spec and force a 288-rect band whose empty columns are all noise.
  const busy = bandBuckets(QUIET, Object.fromEntries(Array.from({ length: 96 }, (_, i) => [i, { events: i + 1 }])));
  const dense = band({
    day: QUIET,
    summary: { ok: true, firstTs: localDayStart(QUIET) - 86_400_000, eventsAgedOut: false, buckets: busy }
  });
  assert.ok((dense.match(/<rect/g) ?? []).length >= 97,
    `a day with all 96 columns populated drew only ${(dense.match(/<rect/g) ?? []).length} rects — 96 bars plus the plate is the floor, so columns are being dropped`);
});

test('round-3 #8: an ok:false timeline renders UI-SPEC :247\'s binding error copy, reason and all, and never a claim about the record', (t) => {
  const markup = band({ day: QUIET, summary: { ok: false, error: 'sentinel-store-unreadable' } });
  const text = decode(markup);

  // The BINDING row (03-UI-SPEC.md:247, "Timeline query failed"), with the reason IN THE
  // VISIBLE SENTENCE. A `title` is not a substitute: Chromium does not reliably expose a
  // title on a non-interactive element, so a reason living only there is a reason the
  // operator never receives.
  assert.ok(text.includes('Could not read the timeline: sentinel-store-unreadable. Pick the day again to retry.'),
    'a rejected/unreadable day does not render UI-SPEC :247\'s sentence with its reason — either the copy was invented or the reason was dropped into a title, and "problem, then what to do next" loses the problem');
  // Read out of the attribute INLINE rather than through the helper, so this case is
  // self-contained about where it is looking: the claim is specifically that the reason
  // survives into `aria-label`, not merely that it appears somewhere in the markup.
  const svgLabel = /<svg[^>]*\saria-label="([^"]*)"/.exec(markup);
  assert.ok(svgLabel && decode(svgLabel[1]).includes('sentinel-store-unreadable'),
    'the failure reason reaches the page but not the SVG\'s aria-label — a screen-reader user is left with a problem and no cause');

  // The three fabrications. Each asserts a FACT ABOUT THE RECORD, and an unread record
  // supports no such fact — this is D-27's failure in its purest form.
  for (const forbidden of ['was quiet', 'No timeline yet', 'Nothing was recorded on']) {
    assert.ok(!text.includes(forbidden),
      `an unreadable day rendered "${forbidden}" — main could not read the store, so the band is asserting something it cannot know, and the operator cannot tell a broken query from a silent floor`);
  }
  t.diagnostic('ok:false is checked BEFORE any gap-cause logic, so no count or firstTs branch can run on a payload that has neither');
});

test('a fresh install (firstTs === null) says the record has not started, not that the day was quiet', () => {
  const text = decode(band({
    day: QUIET, summary: { ok: true, firstTs: null, eventsAgedOut: false, buckets: bandBuckets(QUIET) }
  }));

  assert.ok(text.includes('No timeline yet — the record starts the first time the floor logs an event.'),
    'a store with no events at all renders something other than UI-SPEC :231\'s fresh-install copy');
  assert.ok(!text.includes('was quiet'),
    '"quiet" is a claim about the FLOOR; an empty events table is a fact about the STORE. Saying the first when the second is true is exactly what D-27 forbids');
});

test('a day entirely before the record begins names when the record starts (round-2 #22/#36)', () => {
  // A REAL timestamp two days AFTER the day being viewed — written offset-first so the
  // relationship this case turns on ("later than the requested day") is the first thing
  // read, rather than buried behind a date literal.
  const text = decode(band({
    day: QUIET,
    summary: {
      ok: true, firstTs: 2 * 86_400_000 + 9 * 3_600_000 + localDayStart(QUIET),
      eventsAgedOut: false, buckets: bandBuckets(QUIET)
    }
  }));

  assert.ok(text.includes('Nothing was recorded on 2026-08-20. The stored record starts '),
    'a day older than the whole stored record renders the wrong empty state — before this branch existed it rendered "was quiet", a fabricated claim of genuine silence');
  assert.ok(!text.includes('was quiet'),
    'the day predates the record, so the floor may well have been busy — nothing in the store can say');
});

test('a record that starts INSIDE the viewed day marks the missing hours by their own clock time', () => {
  const firstTs = localDayStart(QUIET) + 9 * 3_600_000 + 30 * 60_000; // 09:30 local
  const markup = band({
    day: QUIET,
    summary: { ok: true, firstTs, eventsAgedOut: false, buckets: bandBuckets(QUIET, { 40: { events: 3, envelopes: 1 } }) }
  });
  const text = decode(markup);

  assert.ok(text.includes('No record before 09:30 — missing, not quiet.'),
    'the gap marker is missing or formatted from the wrong day — round-2 #33: firstTs must be read as a time-of-day WITHIN the viewed day, never as a raw offset');
  // S1e's house terse-visible / full-title pattern, and its load-bearing last clause:
  // the band genuinely cannot tell "never written" from "rotated out".
  assert.ok(text.includes('Hours before that were never written or have since been rotated out — the floor cannot tell you which.'),
    'the full explanation dropped out of the title — claiming either cause would be a fabrication, which is why S1e states both');
  assert.ok(ariaLabelOf(markup).includes('No record before 09:30 — missing, not quiet.'),
    'the gap sentence is on screen but not in the accessible name — UI-SPEC :462 requires the same declaration from the same string');
});

test('a genuinely quiet day inside the record says the FLOOR was quiet, and marks no gap', () => {
  const text = decode(band({
    day: QUIET,
    summary: { ok: true, firstTs: localDayStart(QUIET) - 5 * 86_400_000, eventsAgedOut: false, buckets: bandBuckets(QUIET) }
  }));

  assert.ok(text.includes('2026-08-20 was quiet. The floor recorded nothing that day.'),
    'a day the store can fully speak to, with no rows, renders something other than UI-SPEC :229\'s copy');
  assert.ok(!text.includes('No record before'),
    'the record already started before this day, so there is no missing-record gap on it — marking one invents a hole in a complete day');
});

test('today\'s unlived hours are declared, not drawn as silence', () => {
  const today = todayLocal();
  const text = decode(band({
    day: today,
    summary: { ok: true, firstTs: localDayStart(today) - 86_400_000, eventsAgedOut: false, buckets: bandBuckets(today) }
  }));

  assert.ok(text.includes('The rest of today has not happened yet.'),
    'the buckets after the current time render as ordinary empty ones — indistinguishable from hours the floor sat idle');
});

test('round-3 #9: a day whose events aged out never claims "Nothing was recorded" above its own cost bars', () => {
  const day = '2026-01-05';
  const withSpend = {
    ok: true, firstTs: null, eventsAgedOut: true,
    buckets: bandBuckets(day, { 33: { usd: 1.25, tokens: 4000 } })
  };
  const text = decode(band({ day, summary: withSpend }));

  assert.ok(text.includes('No events are stored for 2026-01-05 — they were never written or have aged out of the record. The cost track below still has that day\'s spend.'),
    'the two-stores case renders as an ordinary no-record day — but the cost ledger is never rotated, so this day HAS spend and the band is drawing it');
  for (const forbidden of ['Nothing was recorded on', 'No timeline yet']) {
    assert.ok(!text.includes(forbidden),
      `eventsAgedOut is true and the band still said "${forbidden}" — it is asserting nothing happened directly above the bars it drew from the same response`);
  }

  // The control: identical payload, flag off. Without this the sentence above could be
  // unconditional and every assertion here would still pass.
  const control = decode(band({ day, summary: { ...withSpend, eventsAgedOut: false } }));
  assert.ok(!control.includes('aged out of the record'),
    'the aged-out sentence renders even when main did not set the flag — it is unconditional text, not a branch');
  assert.ok(control.includes('Nothing was recorded on') || control.includes('No timeline yet'),
    'with the flag off, firstTs === null must fall through to the ordinary no-record copy — the override has swallowed the branch it was meant to outrank');
});

test('round-2 #19: a costTracking:\'none\' agent on the floor is named, so the cost track never reads as a silent zero', (t) => {
  seedServerSnapshot(t, { agents: [agentRow({ id: 'g1', name: 'Grace', provider: 'grok' })] });
  const text = decode(band({
    day: QUIET,
    summary: { ok: true, firstTs: localDayStart(QUIET) - 86_400_000, eventsAgedOut: false, buckets: bandBuckets(QUIET, { 10: { events: 4 } }) }
  }));

  assert.ok(text.includes('1 agent(s) on this floor report no cost meter — spend for those agents never reaches this track.'),
    'an engine that reports no spend at all leaves the cost track at zero with no declared reason — D-35 forbids exactly that, and this is a new surface');
  assert.ok(!text.includes('never reaches the cost ledger'),
    'the transcript-tier sentence rendered for a \'none\'-tier floor — the two gaps have different causes and different remedies, and merging them misdescribes both');
});

test('round-3 #2: a costTracking:\'transcript\' agent gets its OWN sentence — the Accepted Residual, declared', (t) => {
  // codex is the one preset carrying 'transcript': its spend IS measured and the display
  // join shows it, but boot.ts's `if (sample?.sessionId)` append gate means it never
  // lands in the ledger this track is drawn from. That is 03-CONTEXT's first Accepted
  // Residual, and counting only 'none' renders it as the silent zero D-35 forbids.
  // The fixture's premise, pinned against the REAL preset table rather than assumed: if
  // codex ever stops being the transcript-tier engine, this says so instead of leaving
  // the case below quietly asserting nothing about the tier it names.
  assert.deepEqual(
    { costTracking: AGENT_PROVIDER_PRESETS.find((p) => p.id === 'codex')?.costTracking },
    { costTracking: 'transcript' },
    'codex is no longer the preset carrying the transcript tier — re-derive which one does before trusting this case');

  seedServerSnapshot(t, { agents: [agentRow({ id: 'c1', name: 'Cody', provider: 'codex' })] });
  const text = decode(band({
    day: QUIET,
    summary: { ok: true, firstTs: localDayStart(QUIET) - 86_400_000, eventsAgedOut: false, buckets: bandBuckets(QUIET, { 10: { events: 4 } }) }
  }));

  assert.ok(text.includes('1 agent(s) report spend only from their own transcripts — that spend never reaches the cost ledger this track is drawn from.'),
    'a transcript-tier engine\'s missing LEDGER hop is undeclared — its meter works and its card shows spend, so a zero here reads as "it cost nothing"');
  assert.ok(!text.includes('no cost meter'),
    'the \'none\'-tier sentence rendered for a transcript-tier floor — this engine HAS a meter; it is the ledger hop that is missing, and naming the wrong gap sends the operator to the wrong fix');
});

test('a floor of only metered engines declares no cost gap at all', (t) => {
  seedServerSnapshot(t, { agents: [agentRow({ id: 'a1', provider: 'claude' })] });
  const text = decode(band({
    day: QUIET,
    summary: { ok: true, firstTs: localDayStart(QUIET) - 86_400_000, eventsAgedOut: false, buckets: bandBuckets(QUIET, { 10: { events: 4, usd: 0.5 } }) }
  }));

  for (const s of ['no cost meter', 'never reaches the cost ledger']) {
    assert.ok(!text.includes(s),
      `an all-otel floor still declared "${s}" — a gap sentence that always renders is noise, and noise is how a real declaration stops being read`);
  }
});

// ─── DayBandTab — the scrubber, the picker and the detail list (§S1c, §S1d, §S1f) ─────

const okDay = (day, fill) => ({
  ok: true, firstTs: localDayStart(day) - 86_400_000, eventsAgedOut: false, buckets: bandBuckets(day, fill)
});

/** One event row exactly as `timeline.ts`'s `bucketDetail` emits it: the whole hive log
 *  entry lives in `json`, because that is what `appendEvent(kind, json, ts)` was handed. */
const eventRow = (ts, entry) => ({ type: 'event', ts, kind: entry.kind, json: JSON.stringify(entry) });

const attrsOf = (markup, tag) => {
  const m = new RegExp(`<${tag}[^>]*>`).exec(markup);
  assert.ok(m, `the day tab rendered no <${tag}> at all`);
  return m[0];
};

test('the scrubber is a native range input carrying all five attributes in first-pass markup', () => {
  const markup = band({
    day: QUIET,
    summary: okDay(QUIET, { 4: { events: 7, envelopes: 2, usd: 0.05, tokens: 120 } }),
    bucket: { index: 4, detail: { ok: true, rows: [], truncated: false, total: 0 } }
  });
  const input = /<input[^>]*type="range"[^>]*>/.exec(markup);
  assert.ok(input, 'there is no <input type="range"> — D-25 makes arrow keys the step control precisely so no glyph button is needed, and that only works if the control is the native one');

  for (const attr of ['min="0"', 'max="95"', 'step="1"', 'aria-label="Time of day"']) {
    assert.ok(input[0].includes(attr),
      `the scrubber is missing ${attr} — every one of S1c's attributes is plain first-pass markup, which is the whole reason this surface uses a native input`);
  }
  // Without aria-valuetext a screen reader announces "47", which means nothing. The
  // value it announces has to be the bucket's REAL meaning, not its index.
  const vt = /aria-valuetext="([^"]*)"/.exec(input[0]);
  assert.ok(vt, 'the scrubber has no aria-valuetext — it announces a bare bucket index, which tells a screen-reader user nothing about the day');
  assert.equal(decode(vt[1]), '01:00–01:15 · 7 events · 2 envelopes · $0.05',
    'the scrubber announces something other than the selected bucket\'s window and its real counts');
});

test('the day picker is a native date input, capped at today and deliberately WITHOUT a min', () => {
  const markup = band({ day: QUIET, summary: okDay(QUIET, {}) });
  const input = attrsOf(markup, 'input[^>]*type="date"');

  assert.ok(input.includes('aria-label="Day to replay"'),
    'the day picker has no accessible name — it is the one control that decides what the whole tab is about');
  assert.ok(/max="\d{4}-\d{2}-\d{2}"/.test(input),
    'the picker has no max — a day in the future has no rows by construction and main rejects it, so offering it is offering a guaranteed error');
  assert.ok(!/\smin="/.test(input),
    'the picker grew a min bound. S1d refuses one on purpose: a disabled range HIDES when the record starts, and stating it is the whole job of the empty-state copy');
});

test('a truncated bucket shows the real total — it never silently slices', () => {
  const ts = localDayStart(QUIET) + 4 * BUCKET_MS;
  const markup = band({
    day: QUIET,
    summary: okDay(QUIET, { 4: { events: 312 } }),
    bucket: {
      index: 4,
      detail: {
        ok: true, truncated: true, total: 312,
        rows: [
          eventRow(ts + 1000, { kind: 'spawn', name: 'Ada' }),
          eventRow(ts + 2000, { kind: 'drain', agentId: 'ada', count: 3 })
        ]
      }
    }
  });

  assert.ok(decode(markup).includes('Showing 2 of 312 rows in this bucket.'),
    'a capped bucket renders no count — ToolWaterfall.tsx:16 and CommandCenterPanel.tsx:1608 are the two shipped precedents for that sin, and S1e corrects it here');
  // Rendered from main's numbers verbatim. 03-03 drops zero-delta cost rows BEFORE its
  // 200-row cap and defines `total` as the DISPLAYABLE count, so a second filter here
  // would make the two halves of this sentence disagree about what a row is.
  assert.ok(/<li[^>]*>[\s\S]*Showing 2 of 312 rows in this bucket\./.test(decode(markup)),
    'the truncation line is not an <li> in the list it describes — S1e puts it last in the <ol> so it cannot be scrolled away from its own rows');
});

test('round-3 #8: an ok:false bucket detail renders the same binding sentence, never the empty-bucket copy', () => {
  const markup = band({
    day: QUIET,
    summary: okDay(QUIET, { 0: { events: 5 } }),
    bucket: { index: 0, detail: { ok: false, error: 'sentinel-bucket-unreadable' } }
  });
  const text = decode(markup);

  // UI-SPEC :247's row is titled "Timeline query failed" and names no channel, so it
  // binds the bucket query exactly as much as the day query.
  assert.ok(text.includes('Could not read the timeline: sentinel-bucket-unreadable. Pick the day again to retry.'),
    'an unreadable bucket renders an invented sentence or drops its reason — the same defect as the day query\'s, one call deeper');
  assert.ok(!text.includes('Nothing in this fifteen minutes'),
    'an unreadable bucket rendered as an EMPTY one — for exactly the reason a rejected day must never render as a quiet one: the store said nothing, which is not the same as saying nothing happened');
});

test('a genuinely empty bucket says so, rather than rendering as blank space', () => {
  const text = decode(band({
    day: QUIET,
    summary: okDay(QUIET, { 0: { events: 5 } }),
    bucket: { index: 0, detail: { ok: true, rows: [], truncated: false, total: 0 } }
  }));

  assert.ok(text.includes('Nothing in this fifteen minutes.'),
    'a bucket with no rows renders nothing at all — the silent nothing D-27 forbids, and without this branch the unreadable-bucket rule above is true by construction rather than by correct branching');
});

test('the detail list renders every kind, keeps the blank-subject fallback, and declares the missing body', (t) => {
  seedServerSnapshot(t, { agents: [agentRow({ id: 'a1', name: 'Ada' })] });
  const ts = localDayStart(QUIET);
  const text = decode(band({
    day: QUIET,
    summary: okDay(QUIET, { 0: { events: 4, envelopes: 2, usd: 0.0123 } }),
    bucket: {
      index: 0,
      detail: {
        ok: true, truncated: false, total: 5,
        rows: [
          eventRow(ts + 1_000, { kind: 'spawn', name: 'Ada' }),
          eventRow(ts + 2_000, { kind: 'message', from: 'ada', to: 'bob', act: 'ask', subject: 'the build' }),
          eventRow(ts + 3_000, { kind: 'message', from: 'ada', to: 'bob', act: 'ask', subject: '' }),
          eventRow(ts + 4_000, { kind: 'approval', approve: false }),
          { type: 'cost', ts: ts + 5_000, agentId: 'a1', taskId: null, usd: 0.0123, tokens: 900 }
        ]
      }
    }
  }));

  assert.ok(text.includes('spawned Ada'), 'the spawn row lost ActivityTab\'s wording');
  assert.ok(text.includes('ada → bob: the build'), 'the envelope row lost its subject');
  assert.ok(text.includes('ada → bob: ask'),
    'the `|| e.act` fallback was dropped — an envelope with a blank subject renders as an empty colon, which is what that fallback exists to prevent');
  assert.ok(text.includes('approval denied'), 'the approval row lost its granted/denied distinction — the one bit that matters on it');
  assert.ok(text.includes('Ada +$0.0123'),
    'the cost row is missing or is not the clamped DIFF — a cumulative snapshot here would be ADR-0005\'s bug on a second surface');
  assert.ok(text.includes('Envelopes show their subject. The body was never recorded.'),
    'the standing limitation is stated only in a comment — hive.ts:1668 records no body at all, and a list that stays silent about that implies one could be shown');
});

test('the detail list\'s event wording is the SHIPPED ActivityTab formatter, not a second vocabulary', () => {
  // The same technique `shippedRelAge` uses above, and for the same reason: transcribing
  // a body into this file asserts that the transcription matches itself. Reading BOTH
  // real sources means this goes red the day either one is edited alone — which is
  // exactly when a second event vocabulary would start to drift away from the first.
  const lift = (file, re, sig) => {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const m = re.exec(src);
    assert.ok(m, `${file} no longer declares the formatter this anchor names — re-derive it by content, not by line`);
    return new Function(`${m[0].replace(sig, '(e)')}; return ${sig.startsWith('(e: LogEntry') ? 'fmt' : 'fmtActivityRow'};`)();
  };
  const shipped = lift(
    'src/renderer/src/components/CommandCenterPanel.tsx',
    /const fmt = \(e: LogEntry\): string => \{[\s\S]*?\n {2}\};/, '(e: LogEntry): string'
  );
  const copied = lift(
    'src/renderer/src/components/DayBandTab.tsx',
    /function fmtActivityRow\(e: Record<string, unknown>\): string \{[\s\S]*?\n\}/, '(e: Record<string, unknown>): string'
  );

  const cases = [
    { kind: 'spawn', name: 'Ada' },
    { kind: 'spawn', agentId: 'a1' },
    { kind: 'message', from: 'ada', to: 'bob', act: 'ask', subject: 'the build' },
    { kind: 'message', from: 'ada', to: 'bob', act: 'ask', subject: '' },
    { kind: 'drain', agentId: 'ada', count: 3 },
    { kind: 'escalate', subject: 'needs a key' },
    { kind: 'escalate' },
    { kind: 'approval', approve: true },
    { kind: 'approval', approve: false },
    { kind: 'tool', name: 'Bash' }
  ];
  for (const c of cases) {
    assert.equal(copied(c), shipped(c),
      `the day band's wording for ${JSON.stringify(c)} has drifted from ActivityTab's — S1f reuses the five existing cases verbatim so one floor cannot describe the same event two ways`);
  }
});

test('the production mount calls BOTH timeline channels — the IPC 03-03 landed has a real consumer', () => {
  // Without this the whole channel — two handlers, a preload bridge and a pure module —
  // can ship with ZERO renderer callers and every other criterion still passes. That is
  // the shape D-38 exists to prevent, one wave apart.
  const src = fs.readFileSync(path.join(ROOT, 'src/renderer/src/components/DayBandTab.tsx'), 'utf8');
  for (const call of ['window.cth.hiveTimeline(', 'window.cth.hiveTimelineBucket(']) {
    assert.ok(src.includes(call),
      `${call}…) is never called — the day band would render only what a test injects, and 03-03's IPC would be dead code`);
  }
});

test('the day tab is reachable, appended LAST, and mounted with no injected props', () => {
  const panel = fs.readFileSync(path.join(ROOT, 'src/renderer/src/components/CommandCenterPanel.tsx'), 'utf8');

  assert.match(panel, /\{ key: 'timeline', label: 'day', icon: 'clock' \}\s*\n\];/,
    'the timeline entry is not the LAST element of TABS — S1a\'s order is append-only precisely so no tab the operator has muscle memory for moves under them');
  assert.match(panel, /\| 'timeline';/,
    'CCTab was not widened, so the tab key exists in the array and nowhere in the type');
  assert.match(panel, /tab === 'timeline' && <DayBandTab \/>/,
    'the tab body either does not mount DayBandTab or mounts it with injected props — production must take the live-fetch path, and the seam must be additive rather than the only way data ever arrives');

  // The one CSS addition, in the file main.tsx actually imports. A same-named file
  // anywhere else would style nothing and fail silently.
  const bundled = fs.readFileSync(path.join(ROOT, 'src/renderer/src/design/global.css'), 'utf8');
  assert.match(bundled, /\.cth-scrub::-webkit-slider-thumb/,
    'the scrubber thumb rule is missing from the bundled stylesheet — the native thumb is ~10px, well under WCAG 2.2 SC 2.5.8\'s 24px target');
  assert.match(fs.readFileSync(path.join(ROOT, 'src/renderer/src/main.tsx'), 'utf8'), /import '\.\/design\/global\.css';/,
    'main.tsx no longer imports design/global.css — re-derive which stylesheet the app bundles before adding a rule to it');
  assert.ok(!fs.existsSync(path.join(ROOT, 'src/renderer/src/global.css')),
    'a second, top-level global.css appeared. Nothing imports it, so every rule in it is dead and the scrubber would ship unstyled');
});
