/**
 * FloorDeps — the whole Electron surface `bootFloor` (boot.ts) is allowed to
 * touch, modelled on `DeliveryDeps` (delivery.ts:94-162): plain functions, each
 * carrying a comment for WHY it is injected and what degrades if it is not.
 *
 * Deliberately free of any `electron` import so `node --test` can construct and
 * tear down a whole floor with fakes (test/boot-floor.test.cjs). Everything
 * Electron-shaped — app.getPath, safeStorage, Notification, a live webContents,
 * app.quit, BrowserWindow focus/power-save — arrives through this interface,
 * wired at index.ts's `electronDeps()`.
 *
 * Types and nothing else: no construction, no subsystem import, no default
 * export, no barrel.
 */

export interface FloorDeps {
  /**
   * Electron's per-purpose filesystem roots (app.getPath('userData'/'logs'),
   * app.getAppPath()). A THUNK, not a value captured once — `index.ts` used to
   * build these paths at module scope, where they were legitimately unusable
   * before Electron's 'ready' event; `queuePath` in DeliveryDeps (delivery.ts:127-145)
   * is the same discipline for the same reason. Injected so a test can point every
   * root at one tmpdir.
   */
  paths: () => { userData: string; logs: string; appPath: string };
  /** app.getVersion(). Static for the process lifetime — no thunk needed. */
  version: string;
  /** app.isPackaged — whether this is a production build. */
  packaged: boolean;
  /**
   * OS-level secret encryption (Electron `safeStorage`), fail-closed:
   * `available()` must be checked before `encrypt()`; a caller that ignores it
   * and writes anyway is the plaintext-secret bug integrations.ts:19,116-133
   * exists to prevent. Not exercised by anything `bootFloor` constructs today —
   * present because the floor's dependency surface should not have a narrower
   * secret story than the modules (integrations.ts) it wires in.
   */
  secrets: {
    available: () => boolean;
    encrypt: (plaintext: string) => string;
    decrypt: (ciphertext: string) => string;
  };
  /**
   * A native OS toast (Electron `Notification`). Optional-dep-degrades-safely:
   * an unsupported platform, or notifications turned off in settings, is a
   * silent no-op — never a throw that could take a beat timer down with it.
   */
  notify: (o: { title: string; body: string }) => void;
  /**
   * Send an event to the live renderer webContents (a no-op — returns `false` —
   * when no window is attached). Returns `boolean`, NOT `void`.
   *
   * This is load-bearing, not a style choice: `hive.ts:1580-1589`'s
   * `emitTerminalHandoff` computes `this.emit?.(...) === true` to decide whether
   * mail bounces to the god, and `index.ts`'s existing `HiveManager` emitter
   * already returns `boolean` (`const wc = liveWebContents(); if (!wc) return
   * false; try { wc.send(...); return true; } catch { return false; }`).
   * `accountPool`'s own emitter follows the same shape.
   *
   * `delivery.ts:153`'s `DeliveryDeps.emit` is `(channel, payload) => void` —
   * that is the LOCAL CONVENTION this field deliberately departs from. Copying
   * it here would make every `=== true` comparison permanently false and
   * silently re-route all terminal-handoff mail to the god (D-11's bug). Do not
   * "fix" this back to `void`.
   */
  send: (channel: string, payload: unknown) => boolean;
  /** Quit the app (Electron `app.quit()`). */
  quit: () => void;
  /**
   * Raise the app window and tell the renderer to select an agent — issue #42's
   * notification-click UX. Optional: `mainWindow`/`BrowserWindow` are Electron
   * window-management state that stays owned by index.ts (never move into
   * `src/main/floor/**`), so a floor booted with no window (every test) simply
   * never focuses anything instead of throwing.
   */
  focus?: (agentId: string) => void;
  /**
   * Re-evaluate the power-save blocker now that a PTY's liveness may have
   * changed (issue #18 — Windows Modern Standby freezing agent child processes).
   * Optional for the same reason as `focus`: Electron's `powerSaveBlocker` stays
   * index.ts-owned, so a floor with no window/power APIs just skips the
   * keep-awake toggle rather than throwing.
   */
  syncKeepAwake?: () => void;
}
