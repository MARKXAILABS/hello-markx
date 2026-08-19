import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Playwright config for the Electron end-to-end smoke test (#45).
 *
 * Deliberately NOT wired into `npm test`. `node --test test/*.test.cjs` is the
 * unit gate and must stay millisecond-fast and headless; this launches a real
 * Electron app, a real BrowserWindow and a real PTY, and CI runs it in its own
 * workflow (.github/workflows/e2e.yml) so a browser-flavoured flake can never
 * hold the unit gate red.
 */
export default defineConfig({
  testDir: './e2e',

  // ONE app at a time. Each test boots a main process that binds the hive hook
  // socket and the webhook/Slack listeners on fixed ports and spawns PTYs —
  // two workers would fight over all three.
  workers: 1,
  fullyParallel: false,

  // A cold Electron boot, the 1200ms god-spawn delay in useHive, hive
  // provisioning and a real PTY spawn all sit inside one test. The 30s default
  // is a false negative waiting to happen, especially on an xvfb runner.
  timeout: 180_000,
  expect: { timeout: 20_000 },

  // No retries: a smoke test that only passes on the second attempt is telling
  // you something, and swallowing that is how e2e suites become decorative.
  retries: 0,
  forbidOnly: !!process.env.CI,

  reporter: [['list']],

  // Failure artifacts go to the OS temp dir, NOT into the repo. Playwright's
  // default `test-results/` would be untracked clutter in a clean checkout and
  // is not in .gitignore.
  outputDir: join(tmpdir(), 'markx-e2e-results'),
  use: {
    screenshot: 'only-on-failure',
    trace: 'off',
    video: 'off'
  }
});
