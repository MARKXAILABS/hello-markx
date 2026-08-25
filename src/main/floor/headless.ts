/**
 * headless.ts — the windowless-lifecycle decisions, extracted to pure
 * predicates over plain inputs. No `electron` import, no module state, no
 * side effects: every function here takes exactly what it needs to decide
 * and returns a value, so `node --test` can drive all four branches of
 * `quitDecision` with a fake `{allowQuit, livePtyCount, hasWindow}` and never
 * construct a BrowserWindow (test/boot-floor.test.cjs).
 *
 * D-09: `quitDecision`'s `'teardown'` arm is a deadlock fix, not a cosmetic
 * split. Before this module existed, `index.ts`'s `before-quit` handler read
 * `ptyManager.list().length`, called `e.preventDefault()` when it was
 * non-zero, and sent `app:closeRequested` **only inside `if (mainWindow)`** —
 * so a floor started with no window and >=1 live PTY blocked its own quit
 * forever, waiting on a confirmation from a renderer that could never arrive.
 * `'teardown'` is the non-interactive path that route takes instead: the same
 * `Floor.teardownAndQuit()` a confirmed quit already uses.
 *
 * Stated limitation, not papered over: a floor started WITHOUT `--headless`
 * keeps today's quit-on-last-window-close (`shouldQuitOnLastWindowClose`
 * below). This phase ships no tray affordance, and a background process with
 * no window and no icon to reopen one is a worse failure than a quit — so
 * criterion 2's "or with the window quit" holds only for a floor that was
 * started `--headless`, whose attached window can be opened and closed
 * freely without taking the floor down with it.
 */

/** `--headless` present on argv. */
export function isHeadless(argv: readonly string[]): boolean {
  return argv.includes('--headless');
}

export type QuitDecision = 'allow' | 'teardown' | 'ask-renderer';

/**
 * What `before-quit` should do, given the three facts it has:
 *   - `allowQuit` — a quit already in flight (re-entrant `app.quit()` calls,
 *     or a prior confirmed/reset path already tore the floor down) → `'allow'`,
 *     never re-run teardown.
 *   - `livePtyCount === 0` → nothing to lose, `'allow'`.
 *   - `hasWindow` → today's interactive confirmation path, `'ask-renderer'`.
 *   - otherwise → **`'teardown'`**: no window to ask, live PTYs to protect —
 *     take the same non-interactive `Floor.teardownAndQuit()` route a
 *     confirmed quit takes (D-09's fix; see this module's header).
 */
export function quitDecision(s: {
  allowQuit: boolean;
  livePtyCount: number;
  hasWindow: boolean;
}): QuitDecision {
  if (s.allowQuit) return 'allow';
  if (s.livePtyCount === 0) return 'allow';
  if (s.hasWindow) return 'ask-renderer';
  return 'teardown';
}

/**
 * Whether `window-all-closed` should kill the floor. Darwin never quits on
 * last-window-close (dock convention) regardless of mode. Off darwin: a
 * `--headless`-started floor stays up with no window (that is the whole
 * point of the flag); a normally-started floor keeps today's behavior and
 * quits — this phase ships no tray icon, so a windowless, iconless process
 * with no way back in would be a worse trap than quitting.
 */
export function shouldQuitOnLastWindowClose(s: { platform: string; headless: boolean }): boolean {
  return s.platform !== 'darwin' && !s.headless;
}
