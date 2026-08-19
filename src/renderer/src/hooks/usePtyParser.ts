import { useCallback, useEffect, useRef } from 'react';
import { useStore, type ToolKind, type StationKind } from '@/store/store';

// ANSI escape sequence stripper — Claude colors its tool tags with these.
const ANSI_RE = /\x1b\[[0-9;]*m/g;

// Tool call lines look like: `● Read SPEC.md`, `● Bash npm test`, `● Edit src/foo.ts`
const TOOL_RE = /●\s+([A-Za-z][A-Za-z_]*)(?:\s+(.+))?/g;

const TOOL_TO_STATION: Record<string, StationKind> = {
  Read: 'shelf', Edit: 'shelf', Write: 'shelf', MultiEdit: 'shelf',
  Grep: 'shelf', Glob: 'shelf',
  Bash: 'terminal', BashOutput: 'terminal',
  WebFetch: 'web', WebSearch: 'web',
  TodoWrite: 'board', TaskCreate: 'board', TaskUpdate: 'board'
};

const TOOLKIND_BY_NAME: Record<string, ToolKind> = {
  Read: 'Read', Edit: 'Edit', Write: 'Write',
  Bash: 'Bash',
  WebFetch: 'WebFetch', WebSearch: 'WebSearch',
  Grep: 'Grep', Glob: 'Glob',
  TodoWrite: 'TodoWrite'
};

// "Blocked" = Claude is genuinely waiting on the user. Match only real prompts
// (the approval menu / a yes-no question). Do NOT match the bare word
// "permission": the TUI footer always shows "bypass permissions on (shift+tab
// to cycle)", which would otherwise flag a busy agent as blocked on every
// repaint — making it flip-flop between working and blocked.
const BLOCK_HINTS = [
  /Do you want to proceed/i,
  /❯\s*\d+\.\s*Yes/i,            // numbered approval menu, cursor on "1. Yes"
  /Yes, and don't ask again/i,
  /\(y\/n\)/i,
  /\[y\/n\]/i,
];

// The /context output prints "235.3k/1m tokens (24%)" — sniff the DENOMINATOR
// to learn the session's true context-window size. This is the only reliable
// source for sessions on the CLI-default model: the "[1m]" alias exists only
// inside Claude Code; the API model id in the transcript is plain.
const CONTEXT_LIMIT_RE = /[\d.,]+k\s*\/\s*([\d.]+)([km])\s+tokens/i;

/**
 * Subscribe to a pty stream and update the agent's avatar state based on what
 * scrolls past. This is a stopgap until we wire real Claude Code hooks — it
 * inspects the visible terminal output and infers status / station / carrying.
 *
 * Returns a function suitable for `<PtyTerminalView onStreamData={...} />`.
 */
export function usePtyParser(agentId: string) {
  const updateAgent = useStore(s => s.updateAgent);
  const pushFeed = useStore(s => s.pushFeed);
  const idleTimerRef = useRef<number | null>(null);

  const scheduleIdle = useCallback(() => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = window.setTimeout(() => {
      // No new tool calls for ~4 s → assume the model went idle
      updateAgent(agentId, {
        status: 'idle',
        action: 'awaiting',
        description: 'on standby',
        carrying: undefined,
        currentStation: 'desk'
      });
    }, 4000) as unknown as number;
  }, [agentId, updateAgent]);

  const cancelIdle = useCallback(() => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (idleTimerRef.current !== null) {
        window.clearTimeout(idleTimerRef.current);
      }
    };
  }, []);

  return useCallback((chunk: string) => {
    const text = chunk.replace(ANSI_RE, '');
    if (!text.trim()) return;

    // Passive context-limit sniffing from /context output (the gauge poll
    // sends one probe per session; a manual /context works too). The limit
    // only ever ratchets up — contextLimit is volatile across respawns.
    const lim = CONTEXT_LIMIT_RE.exec(text);
    if (lim) {
      const value = parseFloat(lim[1]) * (lim[2].toLowerCase() === 'm' ? 1_000_000 : 1_000);
      if (value >= 100_000) {
        const agent = useStore.getState().agents.find((a) => a.id === agentId);
        if (agent && value > (agent.contextLimit ?? 0)) {
          updateAgent(agentId, { contextLimit: value });
        }
      }
    }

    // The "esc to interrupt" footer is only shown while a turn is in progress.
    const running = /esc to interrupt/i.test(text);

    let lastTool: string | null = null;
    let lastArg: string | null = null;

    TOOL_RE.lastIndex = 0;
    for (let m: RegExpExecArray | null; (m = TOOL_RE.exec(text)) !== null; ) {
      lastTool = m[1];
      lastArg = (m[2] ?? '').trim();
    }

    if (lastTool) {
      const station = TOOL_TO_STATION[lastTool] ?? 'desk';
      const carrying = TOOLKIND_BY_NAME[lastTool] ?? undefined;
      const summary = lastArg ? `${lastTool.toLowerCase()} ${lastArg}` : lastTool.toLowerCase();
      // NOTE: `progress` deliberately untouched — it's the context gauge now
      // (filled by the useHive context poll), not a per-task meter.
      updateAgent(agentId, {
        status: 'working',
        action: summary,
        description: summary,
        currentStation: station,
        carrying
      });
      // Mirror into the in-app feed so the mock terminal view shows it too if
      // ever toggled — harmless for real ptys.
      pushFeed(agentId, `\x1b[36m● ${lastTool}\x1b[0m ${lastArg ?? ''}`);
      // Keep working while the spinner is up; otherwise allow the idle drift.
      if (running) cancelIdle(); else scheduleIdle();
      return;
    }

    // Actively running but no fresh tool line (model is thinking / streaming
    // prose) → keep the agent working at its desk, don't let it drift to idle.
    if (running) {
      cancelIdle();
      updateAgent(agentId, { status: 'working' });
      return;
    }

    // Not running → a genuine approval/question prompt is on screen.
    const recent = text.slice(-400);
    if (BLOCK_HINTS.some(re => re.test(recent))) {
      // A prompt on screen is a full stop for whoever is sitting at it, so BOTH
      // branches are 'blocked'. A sub-agent used to be downgraded to 'waiting',
      // which is also the status for "parked with nothing to do" — so a worker
      // stuck on "Do you want to proceed?" looked exactly like a spare one (#12).
      // Only the god escalates to the HUMAN; a sub-agent is parked on Michael,
      // and that difference is `waitingOnGod`, not a weaker status.
      const isGod = !!useStore.getState().agents.find((a) => a.id === agentId)?.isGod;
      if (isGod) {
        updateAgent(agentId, {
          status: 'blocked',
          waitingOnGod: false,
          action: 'waiting on you',
          description: 'waiting on you',
          currentStation: 'mailbox',
          blockReason: {
            summary: 'Waiting for your reply',
            detail: 'Claude is waiting for input. Check the terminal for the exact prompt.',
            actions: [
              { label: 'Approve', kind: 'approve', send: 'y\r' },
              { label: 'Deny',    kind: 'deny',    send: 'n\r' }
            ]
          }
        });
      } else {
        updateAgent(agentId, {
          status: 'blocked',
          waitingOnGod: true,
          action: 'waiting on god',
          description: 'waiting on god',
          currentStation: 'desk',
          blockReason: {
            summary: 'Waiting on Michael',
            detail: 'A permission prompt is open in this agent\'s terminal. Michael normally answers it — approve it here if he is stuck.',
            actions: [
              { label: 'Approve', kind: 'approve', send: 'y\r' },
              { label: 'Deny',    kind: 'deny',    send: 'n\r' }
            ]
          }
        });
      }
      return;
    }

    // Turn finished, no prompt on screen → let it drift to idle.
    scheduleIdle();
  }, [agentId, updateAgent, pushFeed, scheduleIdle, cancelIdle]);
}
