/**
 * Which OS the renderer is running on.
 *
 * The window runs with `contextIsolation: true` / `nodeIntegration: false`, so
 * there is no `process` in the main world and the preload bridges only `cth` —
 * Electron's user-agent string is the one platform signal the renderer has
 * synchronously. Everything user-facing that differs per OS (a ⌘ vs Ctrl hint, a
 * Settings deep link, sleep behaviour) reads these instead of assuming macOS,
 * which is what shipped macOS-only copy on a tri-platform build.
 */
const UA = typeof navigator !== 'undefined' ? navigator.userAgent : '';

export const IS_MAC = /mac/i.test(UA);
export const IS_WINDOWS = /windows/i.test(UA);
/** Anything that is neither — in practice Linux. */
export const IS_LINUX = !IS_MAC && !IS_WINDOWS;

/** "macOS" / "Windows" / "Linux" — for copy that names the host OS. */
export const OS_NAME = IS_MAC ? 'macOS' : IS_WINDOWS ? 'Windows' : 'Linux';
