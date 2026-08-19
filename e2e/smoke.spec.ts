/**
 * The first end-to-end test: onboarding -> first spawn (#45).
 *
 * WHAT THIS COVERS, AND WHY THAT PATH
 * The floor inspection called out that 7 of 123 renderer files are touched by
 * tests, all of them pure helpers, and that nothing exercises the app as an app.
 * The path it named is the one nobody can currently refactor without fear:
 * a brand-new user boots, walks the onboarding wizard, and Michael clocks in.
 * That single flow crosses every seam we have no other coverage for --
 * renderer -> preload bridge -> IPC -> config write -> harness-home mkdir ->
 * hive provisioning -> a real node-pty spawn -> back into the store and onto
 * the floor.
 *
 * THE ONE STUB, AND WHY IT IS HONEST
 * The engine binary is faked and nothing else is. The sandbox plants a stub CLI
 * and points `config.defaultCommand` at it, so the real spawn path is handed a
 * real executable that boots instantly, prints, and holds the PTY open --
 * exactly the shape of a CLI agent, minus the network and the API key. Every
 * other step is the shipping code. `finish()` never writes `defaultCommand`, so
 * seeding it does NOT skip or shortcut any part of the wizard: onboarding still
 * runs from its true first-run state.
 *
 * ISOLATION
 * Both `--user-data-dir` (config.json, harness.db, the account pool) and HOME /
 * USERPROFILE (`os.homedir()`, which `ensureClaudePermissionsAccepted` writes
 * into, and the `~/HarnessAgents` default the wizard suggests) are redirected
 * into a throwaway temp dir. Running this must never touch the developer's own
 * hive, config or ~/.claude.
 *
 * REQUIRES `npm run build` first -- this drives out/main/index.js, the same
 * bundle a packaged app ships.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO = resolve(__dirname, '..');
const MAIN = join(REPO, 'out', 'main', 'index.js');

/** The one slice of the preload bridge this test reads back from main. */
declare global {
  interface Window {
    cth: { listPtys(): Promise<Array<{ id: string; pid: number; hasOutput: boolean }>> };
  }
}

/**
 * The stub agent CLI. Prints a banner (so the terminal-readiness handshake in
 * useHive sees output and settles) and then holds the PTY open forever -- a
 * PTY's stdin never ends, so `resume()` alone keeps the process alive.
 */
const STUB_ENGINE = [
  "process.stdout.write('MARKX E2E STUB ENGINE ONLINE\\r\\n');",
  'process.stdin.resume();',
  ''
].join('\n');

interface Sandbox {
  root: string;
  userData: string;
  home: string;
}

function makeSandbox(): Sandbox {
  const root = mkdtempSync(join(tmpdir(), 'markx-e2e-'));
  const userData = join(root, 'userData');
  const home = join(root, 'home');
  mkdirSync(userData, { recursive: true });
  mkdirSync(home, { recursive: true });

  const stub = join(root, 'stub-engine.cjs');
  writeFileSync(stub, STUB_ENGINE, 'utf8');

  // A `claude` the ENGINE PROBE can find. The orchestrator step calls
  // `tools:status`, which resolves each engine's binary and refuses to let a
  // user finish onboarding on an engine that is not installed ("pick an
  // installed engine"). `~/.claude/local/claude` is one of the fixed locations
  // resolveCommand() checks, and it hangs off HOME -- which is redirected here
  // -- so the probe passes inside the sandbox and NOWHERE else. It runs the
  // same stub the spawn does, so a lookup that ever routed through this file
  // instead of `defaultCommand` would behave identically.
  const localBin = join(home, '.claude', 'local');
  mkdirSync(localBin, { recursive: true });
  if (process.platform === 'win32') {
    writeFileSync(join(localBin, 'claude.cmd'), `@echo off\r\nnode "${stub}" %*\r\n`, 'utf8');
  } else {
    const sh = join(localBin, 'claude');
    writeFileSync(sh, `#!/bin/sh\nexec node "${stub}" "$@"\n`, 'utf8');
    chmodSync(sh, 0o755);
  }

  // The only seeded config key, and it is what makes the spawn deterministic on
  // every machine: without it the god would launch whatever real `claude` the
  // developer happens to have on PATH. `readConfig()` merges a partial file over
  // DEFAULTS and `onboardingComplete` is absent here, so the app still opens on
  // the wizard -- first-run for real. Quoted because `tokenizeCommand` splits on
  // whitespace and a temp path is allowed to contain some.
  writeFileSync(
    join(userData, 'config.json'),
    JSON.stringify({ defaultCommand: `node "${stub}"` }, null, 2),
    'utf8'
  );
  return { root, userData, home };
}

function sandboxEnv(box: Sandbox): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  env.HOME = box.home;
  env.USERPROFILE = box.home;
  // Main reads this as "we are inside `electron-vite dev`" and would then try to
  // load a Vite dev server that isn't running. Inherited from a developer shell
  // it would silently break the run.
  delete env.ELECTRON_RENDERER_URL;
  // Any Electron-hosted terminal (VS Code's integrated one, Cursor, an agent CLI
  // shell) exports this, and it makes the Electron binary run as plain Node --
  // no app, no window, and an opaque `bad option: --remote-debugging-port` from
  // Playwright. Inheriting the developer's shell must not decide whether the
  // suite runs.
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

test.describe('onboarding -> first spawn', () => {
  let box: Sandbox;
  let app: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    expect(
      existsSync(MAIN),
      `${MAIN} is missing -- run \`npm run build\` before the e2e suite`
    ).toBe(true);

    box = makeSandbox();
    app = await electron.launch({
      args: [
        MAIN,
        `--user-data-dir=${box.userData}`,
        // GitHub's ubuntu runners restrict unprivileged user namespaces, so
        // Chromium's setuid sandbox cannot start there. This relaxes the OS
        // sandbox for the TEST PROCESS ONLY -- the app's own renderer sandbox
        // (webPreferences.sandbox: true) is untouched, and local runs keep the
        // full sandbox.
        ...(process.env.CI ? ['--no-sandbox'] : [])
      ],
      env: sandboxEnv(box),
      cwd: REPO
    });
    page = await app.firstWindow();
  });

  test.afterAll(async () => {
    // Tearing this down is not just `close()`. The app deliberately REFUSES to
    // quit while PTYs are live -- `before-quit` bounces it into a confirm modal
    // in the renderer, and every window's `close` is intercepted the same way --
    // so Playwright's close() hangs forever on a dialog nobody will answer.
    // Destroying the windows skips both handlers and lands on
    // `window-all-closed`, which IS the app's own clean teardown: killAll() then
    // quit(). macOS never quits on last-window-closed, hence the exit() backstop.
    await app?.evaluate(({ BrowserWindow }) => {
      for (const w of BrowserWindow.getAllWindows()) w.destroy();
    }).catch(() => { /* already gone */ });
    await app?.evaluate(({ app: electronApp }) => electronApp.exit(0))
      .catch(() => { /* already quitting, which is the point */ });
    await app?.close().catch(() => { /* already gone */ });
    // Best-effort: on Windows a PTY child that outlives us holds its cwd open.
    // A leftover temp dir is not a test failure.
    try { if (box) rmSync(box.root, { recursive: true, force: true }); } catch { /* the OS will */ }
  });

  test('the wizard counts its steps honestly and Michael clocks in on the floor', async () => {
    const next = page.getByRole('button', { name: 'next', exact: true });

    // The step counter, read off the panel title. Deliberately NOT compared
    // against a hard-coded screen count: the title used to say "STEP n OF 4"
    // while six screens carried a Next button, so the wizard claimed you were
    // nearly done on the third of six. What has to hold is the RELATIONSHIP --
    // every screen numbered, each one higher than the last, and the final screen
    // numbered N of N. That survives someone adding a seventh screen.
    const stepTitle = page.getByText(/^STEP \d+ OF \d+ /);
    const stepNow = async (): Promise<{ n: number; total: number }> => {
      const text = (await stepTitle.textContent()) ?? '';
      const m = /^STEP (\d+) OF (\d+)/.exec(text);
      expect(m, `the wizard title carries no step counter: "${text}"`).not.toBeNull();
      return { n: Number(m![1]), total: Number(m![2]) };
    };
    let expected = 1;
    const advance = async (button = next): Promise<void> => {
      await button.click();
      expect((await stepNow()).n, 'the step counter did not advance').toBe(++expected);
    };

    // -- Screen 1: persona gate ----------------------------------------------
    await expect(page.getByText('WELCOME TO HELLO MARKX')).toBeVisible();
    expect((await stepNow()).n).toBe(1);
    // `next` is disabled until an audience is picked -- the whole rest of the
    // wizard swaps copy register off that choice.
    await expect(next).toBeDisabled();
    await page.getByRole('button', { name: /I'M TECHNICAL/ }).click();
    await expect(next).toBeEnabled();
    await advance();

    // -- Screen 2: showcase --------------------------------------------------
    await expect(page.getByText('MEET YOUR OFFICE')).toBeVisible();
    await expect(page.getByText('TEN ENGINES, ONE OFFICE')).toBeVisible();
    await advance(page.getByRole('button', { name: 'set it up', exact: true }));

    // -- Screen 3: harness home ----------------------------------------------
    const homeField = page.locator('input[placeholder="/path/to/HarnessAgents"]');
    // The suggested default. It used to come from `window.process.env.HOME`,
    // which is always undefined under contextIsolation, so the field rendered
    // empty and Finish failed; the literal tilde is expanded at the config-write
    // boundary instead.
    await expect(homeField).toHaveValue('~/HarnessAgents');

    // A whitespace-only home is caught HERE, not three screens later at finish().
    const beforeError = await stepNow();
    await homeField.fill('   ');
    await next.click();
    await expect(page.getByText('Pick a harness home folder first.')).toBeVisible();
    expect((await stepNow()).n, 'a rejected home still advanced the wizard').toBe(beforeError.n);
    await homeField.fill('~/HarnessAgents');
    await advance();

    // -- Screen 4: the orchestrator's engine ---------------------------------
    // The engine list is FILTERED to providers that can actually drain an inbox
    // -- a god that cannot receive mail silently stops orchestrating the floor.
    // `custom` is hookless by construction and must never show up here.
    await expect(page.getByText('CLAUDE CODE', { exact: true })).toBeVisible();
    await expect(page.locator('input[name="godProvider"][value="codex"]')).toHaveCount(1);
    await expect(page.locator('input[name="godProvider"][value="custom"]')).toHaveCount(0);
    await expect(page.locator('input[name="godProvider"][value="claude"]')).toBeChecked();

    // Engine DETECTION. The rows used to be a static array under the words "each
    // option is a CLI engine you have installed", so a machine with nothing
    // installed showed ten happy rows. Every row must now carry the probe's
    // verdict -- and which verdict is machine-dependent, so assert the count,
    // not the wording: one chip per engine, none missing.
    const engineRows = await page.locator('input[name="godProvider"]').count();
    expect(engineRows).toBeGreaterThan(1);
    await expect(page.getByText(/^(INSTALLED|NOT FOUND)$/)).toHaveCount(engineRows);
    // The sandbox planted a claude stub where the probe looks, so this machine
    // agrees with the machine CI runs on.
    await expect(page.getByText('INSTALLED', { exact: true }).first()).toBeVisible();

    // Switching engine must RESET the model, or the dropdown offers a model the
    // chosen engine has never heard of.
    const model = page.locator('select');
    const claudeModel = await model.inputValue();
    await page.locator('input[name="godProvider"][value="codex"]').check();
    await expect(model).not.toHaveValue(claudeModel);
    await page.locator('input[name="godProvider"][value="claude"]').check();
    await expect(model).toHaveValue(claudeModel);
    await advance();

    // -- Screen 5: repos (optional) ------------------------------------------
    await expect(page.getByText('No repos added yet. Optional, but recommended.')).toBeVisible();

    // `back` really walks the counter backwards, it isn't decorative.
    const atRepos = await stepNow();
    await page.getByRole('button', { name: 'back', exact: true }).click();
    expect((await stepNow()).n).toBe(atRepos.n - 1);
    await next.click();
    expect((await stepNow()).n).toBe(atRepos.n);
    await advance();

    // -- Last screen: permissions, then finish -------------------------------
    // The whole point of the counter fix: the final screen is N OF N, not
    // "4 of 4" three screens early.
    const last = await stepNow();
    expect(last.n, 'the last screen is not the last step').toBe(last.total);
    await page.getByRole('button', { name: 'finish', exact: true }).click();

    // -- The floor -----------------------------------------------------------
    // Onboarding hands straight over to the hive it just set up -- no
    // launch-time hive picker in between.
    await expect(page.getByLabel('Settings')).toBeVisible();
    // Empty roster while the orchestrator boots.
    await expect(page.getByText('CLOCKING IN', { exact: true })).toBeVisible();
    // `~` was expanded and the home was actually created on disk.
    expect(existsSync(join(box.home, 'HarnessAgents'))).toBe(true);

    // -- First spawn ---------------------------------------------------------
    // Michael's card only mounts after main returns ok from a real node-pty
    // spawn -- and the "didn't clock in" panel is what renders instead when it
    // doesn't, so asserting its absence keeps a failure legible.
    await expect(page.getByText('MICHAEL', { exact: true })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText("MICHAEL DIDN'T CLOCK IN")).toHaveCount(0);
    await expect(page.getByText('CLOCKING IN', { exact: true })).toHaveCount(0);

    // And the proof that the card is not a UI illusion: main's live-PTY
    // registry, read back over the same preload bridge the app uses.
    const godPty = () => page.evaluate(async () =>
      (await window.cth.listPtys()).find((p) => p.id === 'pty-god') ?? null);

    const spawned = await godPty();
    expect(spawned, 'main reported no PTY for the orchestrator').not.toBeNull();
    expect(spawned!.pid).toBeGreaterThan(0);

    // An engine that launches and dies on the spot still flashes a card on the
    // floor -- the card is added the moment main returns ok, and PtyManager only
    // drops the dead session a few seconds later (measured at 2-6s on Windows
    // conpty). So the assertion that actually means "the engine is RUNNING" is:
    // the same pid is still there after the boot handshake. Longer is strictly
    // safer here, never flakier -- a live engine stays live.
    await page.waitForTimeout(8000);
    const settled = await godPty();
    expect(settled?.pid, 'the orchestrator engine died during boot').toBe(spawned!.pid);
    // Only flips once the child has actually written bytes through the pty.
    expect(settled?.hasOutput, 'the engine never wrote a byte through its PTY').toBe(true);
  });
});
