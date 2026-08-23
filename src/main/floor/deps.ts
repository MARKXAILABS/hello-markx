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
   * This is load-bearing, not a style choice: `index.ts`'s existing
   * `HiveManager` emitter already returns `boolean` (`const wc =
   * liveWebContents(); if (!wc) return false; try { wc.send(...); return
   * true; } catch { return false; }`), and `accountPool`'s own emitter
   * follows the same shape — several `=== true` decisions read this return
   * value. (Terminal-handoff mail, formerly one of those decisions, is D-11
   * gap 1's fix: it now routes through `HiveManager`'s own injected
   * `handoff` dep, not through this one — see `hive.ts`'s `terminalHandoff`
   * and its wiring in `boot.ts` — but `send` keeps its `boolean` return for
   * everything that still does.)
   *
   * `delivery.ts:153`'s `DeliveryDeps.emit` is `(channel, payload) => void` —
   * that is the LOCAL CONVENTION this field deliberately departs from. Copying
   * it here would make every `=== true` comparison permanently false and
   * silently misread every one of them as refused. Do not "fix" this back to
   * `void`.
   */
  send: (channel: string, payload: unknown) => boolean;
  /**
   * Quit the app (Electron `app.quit()`). With no window there is no
   * renderer to confirm a quit — `Floor.teardownAndQuit()` is D-09's
   * non-interactive path, and this is its last step, called only after
   * `shutdown()` has already run. Nobody may re-add a renderer confirmation
   * in front of it; that is the exact deadlock `quitDecision`'s `'teardown'`
   * arm exists to close.
   */
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
  /**
   * Spawn (or respawn) an agent PTY — index.ts's `spawnAgentCore`: real PTY +
   * webContents wiring, ~480 lines deep in IPC/renderer concerns, too large and
   * too Electron-shaped to relocate under `src/main/floor/**`. Injected so
   * `respawnOnAccount`'s failover DECISION can live in boot.ts while the spawn
   * mechanics itself stays index.ts-owned. `opts`/`owner` are `unknown` here on
   * purpose — their real shapes (`AgentSpawnOptions`, `Electron.WebContents`)
   * are index.ts/boot.ts-local and this file stays free of both.
   */
  respawnCore: (opts: unknown, owner: unknown) => Promise<{ ok: boolean; error?: string; account?: string }>;
  /**
   * Start the ephemeral-worker spawn-request watcher (index.ts's
   * `startEphemeralWorkerWatcher`). A callback rather than something `bootFloor`
   * owns directly, for the same too-large-to-relocate reason as `respawnCore`:
   * it spawns via `spawnAgentCore` too. Optional so a floor booted without it
   * (every test) just never polls for spawn-requests.
   */
  startWorkerWatcher?: () => void;
}
