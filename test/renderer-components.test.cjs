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
let PixelButton, blockReasonFromApproval;
try {
  ({ PixelBadge } = loadTs('src/renderer/src/components/PixelBadge.tsx'));
  ({ PixelButton } = loadTs('src/renderer/src/components/PixelButton.tsx'));
  ({ BlockedBanner } = loadTs('src/renderer/src/components/BlockedBanner.tsx'));
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
  ({ blockReasonFromApproval } = loadTs('src/renderer/src/hooks/useHive.ts'));
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
for (const [name, value] of Object.entries({ PixelBadge, PixelButton, BlockedBanner, AgentCard, useStore, relAge, TaskCard, TaskAge, TaskDetail, parseTasks, AskMeTab, refreshHiveTasks })) {
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

test('GATE-03 rule D-2: the terminal feed line survives — it is the audit trail, not a duplicate', () => {
  // The requirement is that the operator does not HAVE to read a terminal, not that the
  // trail is deleted. Counted rather than merely matched: a second ⛔ push would mean the
  // feed is being written twice per refusal.
  assert.equal((useHiveSource().match(/⛔/g) ?? []).length, 1,
    'the ⛔ feed push was dropped or duplicated — D-2 keeps exactly the one that was already there');
});
