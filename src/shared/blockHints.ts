/**
 * "This agent is waiting for a human" — the one list, and the one matcher.
 *
 * MOVED VERBATIM from `src/renderer/src/hooks/usePtyParser.ts:31-37`, and that
 * declaration is now DELETED rather than left in place: the hook imports this
 * module. The list lived in the renderer, so it could only ever see the MOUNTED
 * terminal: an agent blocked on a permission prompt in a background tab, in a
 * closed window, or on a headless floor (`src/main/floor/headless.ts`) was
 * invisible to it. It lives here so main can evaluate it too, which is what
 * makes VIGIL-03's guard in `delivery.ts` reachable at all. Electron-free,
 * node-free, DOM-free, so both tsconfig projects can include it and
 * `node --test` can load it directly.
 *
 * TWO READERS, ONE LIST: `src/main/floor/boot.ts:1092` (over
 * `PtyManager.outputTail`, the reader that works with no window) and
 * `usePtyParser.ts` (over the mounted terminal's chunks). Both call
 * `matchBlockHint`, so there is one matcher as well as one list — a second copy
 * of either drifts, and the copy that drifts is the one nobody is looking at
 * (T-04-BLK-12).
 *
 * The patterns are copied unchanged. Match only real prompts (the approval menu
 * / a yes-no question) and NOT the bare word "permission": the Claude TUI footer
 * always shows "bypass permissions on (shift+tab to cycle)", which would
 * otherwise flag a busy agent as blocked on every repaint, flip-flopping it
 * between working and blocked.
 *
 * KNOWN FALSE POSITIVE, INHERITED — NOT INTRODUCED HERE. Documented at
 * `useHive.ts:140-144`: these patterns are matched against the terminal tail, so
 * an agent that merely ECHOES a yes/no prompt (quoting it back in its own prose,
 * writing it into a file, reading it aloud from a transcript) is falsely marked
 * blocked. Its recovery is its next real turn-end — and the bounded window below
 * preserves that recovery mechanically: the echo scrolls out and stops matching.
 * The recovery path is the reason this is a derived read with no cache and no
 * latch anywhere in the chain. Carried with the code per 04-UI-SPEC rule V-3.
 *
 * KNOWN COVERAGE CEILING, PER ENGINE — the register, not an implication.
 *
 * SEVEN engines run on this floor: Claude Code on its own native `--settings`
 * path (`agentProvider.ts:229-235`), plus the six hooks-bridged shims
 * `'agy' | 'codex' | 'pi' | 'opencode' | 'grok' | 'kimi'`
 * (`BridgeDescriptor`, `agentProvider.ts:71`). The list below was written
 * against exactly ONE of them.
 *
 *   • claude — THE ENGINE THE PATTERNS CAME FROM. `❯ 1. Yes` is Claude Code's
 *     TUI approval menu, and every shape here arrived from that TUI's parser,
 *     `src/renderer/src/hooks/usePtyParser.ts:31-37`. Observed in ordinary use
 *     of this app.
 *   • codex — the only OTHER engine with a CLI installed on this machine, and
 *     therefore the only one on which this list can be observed live AT ALL.
 *     Plan 04-13 task 4 makes that single observation. Until it lands, whether
 *     a blocked codex agent matches anything here is unmeasured.
 *   • grok, pi, OpenCode, kimi, agy — NOT OBSERVED LIVE for block detection,
 *     and not observable here: no CLI for any of them is installed on this
 *     machine. What would settle it is an installed CLI plus an account for
 *     that engine, and someone watching a real agent sit on a real prompt.
 *     Nothing weaker settles it, and no marker in this file claims otherwise.
 *
 * WHAT THE CEILING COSTS, PLAINLY (T-04-BLK-11): on any of those six a genuinely
 * blocked agent may match NOTHING. The guard is then correct and simply never
 * fires — the agent is idled by the quiesce backstop, mailed more work by the
 * wake nudge, and the operator sees a green floor with a stalled agent on it.
 * That is VIGIL-03's own failure mode wearing a passing test. It is written here
 * so it is read beside the list, rather than discovered by an operator whose
 * codex agent sat on a prompt all night.
 *
 * THE CORRECT RESPONSE TO A MISS IS TO ADD THAT ENGINE'S PROMPT SHAPE TO THIS
 * LIST — never to widen an existing pattern on a guess. Widening buys unknown
 * coverage at a known cost: every false positive parks a working agent behind a
 * "needs you" badge, and `/\(y\/n\)/i` is already loose enough to catch an agent
 * quoting a prompt back at itself (see the inherited false positive above).
 */

/** The patterns that mean "this agent is waiting for a human". */
export const BLOCK_HINTS: readonly RegExp[] = [
  /Do you want to proceed/i,
  /❯\s*\d+\.\s*Yes/i,            // numbered approval menu, cursor on "1. Yes"
  /Yes, and don't ask again/i,
  /\(y\/n\)/i,
  /\[y\/n\]/i,
];

/**
 * How much of the tail is examined.
 *
 * `PtyManager.outputTail()` returns up to TAIL_CAP_BYTES (256 KiB, `pty.ts:76`)
 * and main evaluates this once per live agent on every DeliveryService tick
 * (4 s), so an unbounded sweep would cost every agent's whole scrollback four
 * times a minute for the life of the floor.
 *
 * The bound is also the correctness argument, not just the cost one: a prompt
 * that has scrolled far out of view is not a prompt the agent is still sitting
 * on. Bounding the window IS the recovery path — the agent prints past the
 * prompt, the prompt leaves the window, the determination clears itself.
 *
 * 4 KiB comfortably holds a TUI's prompt block plus the frame around it (the
 * renderer's own evaluation site used 400 characters — `usePtyParser.ts:157` —
 * which is a single repaint's worth; this is roughly ten of them, because main
 * samples on a 4 s tick rather than on every chunk and must not miss a prompt
 * that arrived just before the sample).
 *
 * Named BYTES for the value it bounds — PTY output — but applied with
 * `String.slice`, which counts UTF-16 code units. For ASCII terminal output the
 * two are the same; for anything else this examines a little MORE text than the
 * name says, never less, so the cost ceiling is the honest direction to round.
 */
const RECENT_WINDOW_BYTES = 4096;

/** 04-UI-SPEC rule A8: the matched line is model-controlled text bound for a
 *  fixed-width row, so it is capped in MAIN and ellipsised by CSS — never sent
 *  unbounded and trimmed at the far end. */
const MAX_PROMPT_CHARS = 120;

/** OSC (`ESC ] … BEL` or `ESC ] … ESC \`) — window titles, hyperlinks, and the
 *  shell-integration markers a TUI emits. Stripped FIRST because its payload can
 *  contain bytes that would otherwise look like the start of a CSI. */
const OSC_RE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
/** Full CSI, not just SGR. The renderer's stripper (`usePtyParser.ts:5`) is
 *  `/\x1b\[[0-9;]*m/g` — colour only — which is enough when the string is only
 *  ever fed to a regex, and NOT enough here: this string is returned for a
 *  renderer to paint, so cursor-movement and mode-set sequences have to go too. */
const CSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
/** C0 and C1 controls, keeping tab (\x09) and newline (\x0a) — the newline is
 *  load-bearing, it is what splits the window into lines below. Also mops up any
 *  orphan ESC left by a sequence that was truncated at the window boundary. */
const CONTROL_RE = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;

/**
 * The matched prompt line when the tail of `recent` looks like an agent waiting
 * for a human, else `null`.
 *
 * Returns the LINE rather than a boolean because the agent card paints it as the
 * agent's context row ("Ada · needs you · Do you want to proceed?", 04-UI-SPEC
 * rule V-2), and rule A8 requires the stripping and the capping to happen in
 * main, once, at this boundary. Callers render the return value; they never
 * re-derive it from the tail themselves.
 *
 * Newest line first: a TUI repaints its whole frame, so a window can hold several
 * matching lines from successive paints and the one the agent is actually sitting
 * on is the last one printed.
 *
 * Strip THEN cap, in that order. Capping first would leave a truncated escape
 * sequence in a string a renderer later inserts into the DOM as text.
 */
export function matchBlockHint(recent: string): string | null {
  if (!recent) return null;
  const window = recent.length > RECENT_WINDOW_BYTES ? recent.slice(-RECENT_WINDOW_BYTES) : recent;
  const clean = window.replace(OSC_RE, '').replace(CSI_RE, '').replace(CONTROL_RE, '');
  const lines = clean.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    if (!BLOCK_HINTS.some((re) => re.test(line))) continue;
    return line.length > MAX_PROMPT_CHARS ? line.slice(0, MAX_PROMPT_CHARS) : line;
  }
  return null;
}
