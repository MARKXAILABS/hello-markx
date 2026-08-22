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
try {
  ({ PixelBadge } = loadTs('src/renderer/src/components/PixelBadge.tsx'));
  ({ BlockedBanner } = loadTs('src/renderer/src/components/BlockedBanner.tsx'));
  ({ AgentCard } = loadTs('src/renderer/src/components/AgentCard.tsx'));
  ({ useStore } = loadTs('src/renderer/src/store/store.ts'));
  ({ autoModeFlagForProvider, AGENT_PROVIDER_PRESETS } = loadTs('src/shared/agentProvider.ts'));
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
for (const [name, value] of Object.entries({ PixelBadge, BlockedBanner, AgentCard, useStore })) {
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
