# Hello MarkX

## What This Is

A desktop app (Electron + React + node-pty) that runs a **team** of AI coding agents as an
office you can watch. Each agent is a real terminal running a real coding CLI — Claude Code,
Codex, Grok, Qwen and seven more — seated at a desk on an isometric floor, mailing each
other work through a hive protocol, with one "god" agent (Michael) dispatching from a task
ledger. It is for a developer who wants to delegate to several agents at once and still see
what every one of them is doing.

## Core Value

**You can leave it running and trust it.** Agents keep working, keep talking to each other,
and never destroy your work — and when one needs a human, you find out.

Everything else — the floor, the voice, the memory palace, eleven engines — is worth nothing
if the office quietly loses an agent's hour of work or stalls without telling you.

## Requirements

### Validated

<!-- Shipped, merged to main, and verified by a green three-platform CI. -->

- ✓ Agent work is never destroyed by the app itself — worktree teardown is gated on
  unintegrated work on every path, including account failover — #1, PR #51
- ✓ Nothing an agent, Slack message or webhook says can become keystrokes in another agent's
  terminal — #2, PR #51
- ✓ A crash mid-write cannot reset the floor to onboarding — registry, ledger, config and
  account pool are written atomically — #3, PR #51
- ✓ Mail to an unknown recipient bounces to the god instead of vanishing while the log says
  "sent" — #6, PR #51
- ✓ The suite runs in CI on ubuntu, windows and macOS, and can fail — #7, PR #51
- ✓ The window will not navigate away, opens only https externally, and runs sandboxed — #8
- ✓ `fs:*` / `git:*` IPC is confined to managed roots, symlinks included — #9
- ✓ Production writes logs and reports crashes — #13 (partial: the UI button remains)
- ✓ The hive commits without freezing the supervisor — #11
- ✓ Windows is a first-class platform: 7 real Windows source bugs fixed, including a Node
  installer that ran `msiexec` on an MSI whose checksum check never aborted — #57, #58, #60
- ✓ `npm run build` works from a clean clone — #52

### Active

<!-- Current scope. See ROADMAP.md for phasing. -->

- [ ] Every remaining audit finding closed, with no partially-landed fix left described as
      done — 20 open issues
- [ ] The office runs headless: no window required, reachable from a phone
- [ ] Every engine is a first-class citizen — mailbox, cost accounting and compact for all
      eleven, not just Claude
- [ ] Spend is attributable and capped per task, and "done" is verified by someone other
      than the agent that claimed it
- [ ] Many floors: per-project workspaces that cannot read each other's memory
- [ ] Yesterday is replayable — every hive event, envelope and cost on one timeline

### Out of Scope

- **Training or fine-tuning models** — this orchestrates agent CLIs; it never owns weights.
- **Being an IDE** — there is a file/diff pane for context, not an editor to live in.
- **A hosted multi-tenant service** — single-operator, local-first. The daemon is for *your*
  floor reachable from *your* phone, not other people's agents on someone else's server.
- **Replacing the agent CLIs** — the value is orchestration and visibility. When Claude Code
  or Codex changes, the app adapts to them.
- **Claiming an engine works when it has never been run** — four bridges are marked
  `live-unverified` in source and stay marked until someone runs them.

## Context

- **Provenance.** Originally a fork; now standalone at `MARKXAILABS/hello-markx` (rebrand
  `cf6a500`, 2026-08-20). `SPEC.md` describes a superseded tmux-era MVP and is retained as
  history, not as a description of the app.
- **The audit is the backlog.** `docs/floor-inspection.html` is a full code audit of
  `1ad9638` — 8 Critical, 12 High, 27 Medium/Low, with file:line evidence. Every finding
  became a GitHub issue (#1–#61) and the three horizons became epics #47/#48/#49. Nine more
  defects have been found since, all of them surfaced by making CI able to fail.
- **Codebase map.** `.planning/codebase/` holds seven documents written by parallel mapper
  agents: STACK, INTEGRATIONS, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, CONCERNS.
  Read those before planning any phase.
- **Two god-files dominate.** `src/main/index.ts` (5,620 lines, ~157 IPC handlers, 30+
  mutable module globals) and `src/main/hive.ts` (3,562 lines). Both need extraction along
  their seams; each extraction unlocks tests that cannot exist today. This is the single
  biggest structural debt.
- **Decision records.** `docs/adr/0001`–`0004` capture the load-bearing choices: the
  one-gate PTY writer, the prompt-cache invariant, fail-safe worktree GC, the
  single-committer git model. `docs/message-queue.md` covers who may type into a terminal.
- **Proven working method.** Three multi-agent runs have landed on this repo using **strict
  disjoint file ownership** — each agent owns an exclusive file list, runs no git, and the
  orchestrator verifies and commits. Horizon 1 (10 agents, ~43 min) and Horizon 2 (9 agents,
  ~61 min) both merged with zero test regressions. Git-worktree isolation was tried and
  rejected: the tests `require('typescript')` and `require('node-pty/…')`, so every worktree
  would need its own `node_modules`.

## Constraints

- **Tech stack**: Electron 32 (end-of-life — Chromium 128, outside the latest-3 support
  window, no CVE backports), React 18, node-pty, Pixi.js, xterm.js, better-sqlite3. The
  bump to Electron 38+ is real work, not a version string.
- **Runtime**: Node 22 is required for anything native. Node 24 has no better-sqlite3
  prebuild and breaks node-pty's winpty gyp. Pinned in `engines` and `.nvmrc`; CI uses 22.
- **Lockfile**: `package-lock.json` must be written by **npm 10**, never the npm 11 that
  ships with Node 24 — npm 11 drops peer dependencies (`hono`) that npm 10 then refuses to
  install without. This already cost one fully-red CI round.
- **Testing**: no framework. Plain `node --test` over `test/*.test.cjs`, with
  `test/load-ts.cjs` transpiling TypeScript on demand. All three platforms are hard gates;
  there is no `continue-on-error` in the matrix and none should be added.
- **Security**: five HTTP servers in main plus one local socket and a per-agent child-process
  proxy; two can be exposed via an opt-in public tunnel. Agents run with permissions
  bypassed by design, so the standing `permissions.deny` list is the real gate.
- **Verification honesty**: an agent reporting "fixed" is a claim, not evidence. Every
  substantive change is re-verified by the orchestrator against source and a live test run.
  This rule exists because it has already caught real over-claims.
- **Zero recurring cost; one-time purchases allowed**: the operator pays for a **Claude Code
  subscription and nothing else on an ongoing basis**. A one-off fee is acceptable; a
  subscription, an annual renewal or a metered API on a required path is not. A capability
  that cannot be built under that rule is either built a different way or shipped with its
  limitation stated out loud — never quietly reinterpreted into something cheaper.

  **Total cost of the entire roadmap: $0.** Nothing is chargeable.

- **Personal tool, run locally — not a published product**: one operator, one machine, no
  distribution. This is a real scope constraint, not a footnote, and it demotes a whole
  class of work:

  - **Paid code signing and notarization are out**, on cost grounds rather than scope — see
    the table above. FLOOR-06 delivers free Sigstore provenance and checksums instead.
  - **Onboarding and the bug template serve one person** who has already onboarded.

  **Operator decisions, taken 2026-08-20 against my recommendation and recorded so nobody
  re-opens them as oversights:**

  - **FLOOR-06 stays in full.** I proposed dropping the release pipeline as dead weight for a
    tool nobody downloads. The operator kept it — the pipeline is ready if this is ever
    published, and `check:links` plus provenance cost little once built.
  - **The public tunnel stays supported.** I proposed LAN-plus-auth only, since exposing an
    authenticated door to an agent floor on the public internet buys convenience the LAN path
    already covers. The operator wants it. It is therefore built to a higher bar than the LAN
    path, not the same one: **off by default; a strong generated token, never a
    user-chosen password; rate limiting and lockout on the auth endpoint; the public URL
    visible in the UI whenever it is live so it can never be up without the operator knowing;
    and an explicit stop that actually closes it** — the existing `stop()` could not, which
    was a real audit finding.

  What it makes *more* important, because it is your machine and your repos:
  reliability, blast-radius containment, cost control, memory that compounds across your own
  projects, multi-floor isolation between your projects, and the GSD integration that matches
  how you actually work.

  Accessibility stays in scope regardless — the 8–12px text and missing focus rings are a
  daily annoyance for the one person using this, not a compliance checkbox.

  **Keep the repo public.** GitHub Actions is unmetered on public repositories and capped on
  private ones, and CI is load-bearing here. There is nothing secret in it.

- **Mobile is Android-only**: no iOS. That removes the Apple Developer Program ($99/yr) and
  notarization from scope entirely — `build/notarize.cjs` and the macOS signing secrets are
  unused, not aspirational. The phone surface (DAEMON-02) is a **PWA** served by the daemon
  and added to the Android home screen: $0, no store review, instant updates. A sideloaded
  self-signed APK is also $0 — Android self-signing is free, unlike Windows. Google Play
  distribution is the only chargeable route at **$25 one-time, never renewed**, and it gates
  no engineering: the PWA ships first and Play is an optional later step.

  What this rules out, concretely, and what replaces it:

  | Wanted | Cost | Free path taken instead |
  |---|---|---|
  | Windows Authenticode signing | Azure Trusted Signing $9.99/mo; EV cert $400–900/yr | **`actions/attest-build-provenance`** (Sigstore, free on public repos) + published checksums, and README/CONTRIBUTING state plainly that Windows shows SmartScreen |
  | macOS notarization | Apple Developer $99/yr | Unsigned build; document the right-click-open / `xattr -d com.apple.quarantine` path honestly |
  | Phone access via a hosted tunnel | varies | Cloudflare Tunnel free tier, Tailscale free tier, or LAN-only with a self-signed cert — operator's choice, all free |
  | Obsidian as a dependency | free personal, **paid for a 2+ person business** | Never a dependency. `<harnessHome>` is plain markdown with `[[wikilinks]]`; the office parses links itself. Obsidian, Logseq, VS Code or `grep` are all just optional viewers |
  | Semantic recall via a hosted embeddings API | metered | Local embedding model (today's `mempalace`), or SQLite FTS5 in the already-open `PersistStore` |

  **Non-Claude engines and the voice/Bedrock paths stay optional, never required.** Each of
  the other ten engines needs its own subscription, so the code supports them but the project
  never assumes them. This is also the honest reason PARITY-03's four `live-unverified`
  bridges stay marked: verifying them needs paid accounts this project does not have.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Disjoint file ownership per agent, no worktrees | Tests need `node_modules`; per-worktree native rebuilds are infeasible. Disjoint ownership makes merge conflicts impossible by construction | ✓ Good — three runs, zero conflicts |
| Land the CI/test surface before any fixes | Nothing else can be proved not to have broken something | ✓ Good — immediately exposed 4 defects that had failed silently on every run |
| Close only genuinely-fixed issues; keep partials open with what remains | A green checklist that overstates reality is worse than an honest one | ✓ Good — caught 4 over-claims |
| Windows is a hard gate, no `continue-on-error` | A permanently-yellow job is how 3 real Windows defects stayed invisible while Windows shipped as a headline | ✓ Good |
| Move autonomy from renderer to main | Closing the window stopped all mail; the renderer is a view, not the scheduler | ⚠️ Revisit — nudge and failover moved, queue-drain and idle-quiesce did not (#5) |
| Keep four engine bridges marked `live-unverified` | They have never been run; marking them verified would be a lie in the source | — Pending real hardware |
| Electron bump deferred, not skipped | Needs a native rebuild; Node 22 has now been restored, so it is unblocked | — Pending Phase A |

---
*Last updated: 2026-08-20 after the GSD codebase map and the Horizon 1 + 2 merges.*
