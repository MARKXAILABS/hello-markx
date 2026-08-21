# Hello MarkX

### Run an office of AI coding agents on your own machine

**Free, open source and local-first** — a multi-agent harness that works with the
subscriptions you already pay for. It turns the terminal coding CLIs you already run into a
coordinated team: each agent gets long-term memory, a mailbox and a desk on a 2D office floor,
and an orchestrator routes work between them while you watch.

Wraps [Claude Code](https://claude.com/claude-code), Antigravity (Gemini), OpenAI Codex,
xAI Grok, Kimi Code, Qwen, OpenCode, Crush, pi.dev and GitHub Copilot CLI — with
bring-your-own keys and local LLMs.

<p><em>Electron · React · TypeScript · Pixi.js · xterm.js · node-pty</em></p>

[![License: MIT](https://img.shields.io/badge/license-MIT-F4D35E.svg?style=flat-square&labelColor=6E1423)](./LICENSE)
[![Version: 0.4.4](https://img.shields.io/badge/version-0.4.4-F4D35E.svg?style=flat-square&labelColor=6E1423)](./CHANGELOG.md)
![Platform: macOS | Windows | Linux](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-F4F1EA.svg?style=flat-square&labelColor=6E1423)

## Contents

- [What it is](#what-it-is)
- [How it works](#how-it-works)
- [Features](#features)
- [Getting started](#getting-started)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Design system](#design-system)
- [Contributing](#contributing)
- [Telemetry](#telemetry)
- [License](#license)

## What it is

Hello MarkX is a desktop app that wraps **real terminal-agent CLIs** as fully-capable agents,
wires them into a **hive**, and puts an **orchestrator** in charge — the one agent *you* talk to
in order to get things done.

- **Every terminal is an agent.** Each `claude`, `agy`, `codex`, `grok`, `kimi`, `qwen`,
  `opencode`, `crush`, `pi`, `copilot` or custom session runs as a real process in a
  pseudo-terminal (`node-pty`), byte-for-byte authentic, rendered with xterm.js.
- **Every agent is an avatar.** Sessions appear as characters on a Pixi.js office floor — they
  walk to stations as they work, and envelopes fly desk-to-desk when they message each other.
- **The hive coordinates them.** Agents read their memory and drain a mailbox; the router moves
  messages between inboxes; the orchestrator adjudicates, assigns, and escalates only when it
  needs you.
- **Memory that persists.** A markdown-first memory layer — per-agent `memory.md`, condensed
  when it grows — plus an optional semantic index if you install the MemPalace CLI. Agents
  remember across sessions with or without it.

## How it works

```
            you ── talk to ──►  ┌─────────────┐
                                │ orchestrator│  supervisor
                                │  (Michael)  │  roster · routing · adjudication
                                │             │  blackboard · task ledger
                                └──────┬──────┘
                                       │ assigns · routes · escalates
              ┌────────────────────────┼────────────────────────┐
              ▼                         ▼                         ▼
        ┌───────────┐            ┌───────────┐            ┌───────────┐
        │  agent A  │  message   │  agent B  │  message   │  agent C  │
        │ provider  │ ─────────► │ provider  │ ─────────► │ provider  │
        │  + memory │            │  + memory │            │  + memory │
        └───────────┘            └───────────┘            └───────────┘
              └──────── shared hive: memory · mailbox · blackboard · log ───────┘
```

1. **You spawn agents** — each is a normal terminal process with its own working directory,
   identity, and provider-specific lifecycle.
2. **Agents collaborate through the hive** — a local git repo of plain files. They write to
   their own `outbox/`; the harness's router delivers into recipients' `inbox/`. No agent ever
   touches git (single-committer design avoids `index.lock` corruption).
3. **The orchestrator runs the floor** — it reads every request, resolves routine ones itself,
   and escalates critical items (spend, destructive ops, scope changes) to you. Escalation is
   the orchestrator's *instructions*, not an enforced gate: with auto mode on (the default)
   nothing pauses for approval. See [`SECURITY.md`](./SECURITY.md#known-limitations).
4. **Everything is visible** — avatars move, envelopes fly, the terminal stream is live; you can
   type back into any session, browse its files, and read its git history.

See [`HIVE.md`](./HIVE.md) for the multi-agent design,
[`docs/message-queue.md`](./docs/message-queue.md) for how anything gets typed into a live
agent's terminal, [`docs/adr/`](./docs/adr/) for the standing architectural decisions, and
[`DESIGN.md`](./DESIGN.md) for the visual system. [`SPEC.md`](./SPEC.md) is the original
tmux-era MVP spec, kept for history — it no longer describes the app.

## Features

**The floor**
- Every terminal is a real agent — ten engines plus custom commands, each in its own PTY.
- Every agent is an avatar on a pixel-art office floor whose state reflects real work.
- An orchestrator you talk to — by text or, with **Talk**, by voice.
- Optional per-agent git worktrees so parallel agents never collide on branches.

**Memory & coordination**
- The hive — per-agent memory, atomic-file mailboxes, a shared blackboard, an append-only event
  log, single-committer git.
- Semantic recall — optional, and only if the MemPalace CLI is on your `PATH`; each call
  spawns it, so the first one pays an embedding-model load. Markdown memory works without it.
- A knowledge base of your own documents, queryable by any agent. **Off by default**; search
  is keyword scoring over text chunks, not entities or a graph.

**Control & safety**
- Human gates — spend, scope, and destructive ops escalate to you. Steer mid-run or stop
  gracefully. Note **auto mode ships on**, which removes each engine's tool-approval prompt.
  A standing deny list still blocks the unrecoverable (`push --force`, `reset --hard`,
  `rm -rf`, reading credential files) on Claude agents; turn auto mode off in
  Settings → General to be asked before every tool. See
  [`SECURITY.md`](./SECURITY.md#known-limitations) for exactly what that list does and
  does not cover.
- Circuit breaker — a steer → constrain → stop ladder for agents that loop, storm errors, or blow
  their budget.
- Budgets & telemetry — per-agent token budgets, real cost from transcripts, a durable ledger,
  OTel spans, and a tool waterfall.

**Command Center**
- Kanban tasks with dependencies, scheduled missions + heartbeat, live fleet monitoring, memory
  search, activity log, and a CI watcher.
- Skills — what every agent can already do, plus a browsable catalog with install and uninstall.
- Built-in Monaco IDE — file tree, editor tabs, and CHANGES · HISTORY · COMPARE git rails.

**Getting work in and out**
- Slack & webhooks — message a channel or POST a webhook; the orchestrator can spawn an
  ephemeral worker, reply in-thread, and tear it down.
- Shareable hires — import a role from a `hellomarkx://hire` link; import only pre-fills the
  form, a human still spawns it.
- BYOK keys + local LLMs — per-provider keys in a write-only secret broker, plus Ollama /
  LM Studio / vLLM base URLs.
- A pool of Claude accounts — register any number of Claude subscriptions, pin any agent to
  one or let the harness pick the least-loaded, with automatic failover. See
  [`docs/claude-accounts.md`](docs/claude-accounts.md).
- Auto-update from this repository's releases, and a Prerequisites page that shows which
  supporting tools you have and installs what's missing.

## Getting started

### Prebuilt downloads, and what they are actually signed with

Installers for all three platforms are on the
[releases page](https://github.com/MARKXAILABS/hello-markx/releases/latest), with a
`SHA256SUMS.txt` beside them and a [Sigstore](https://www.sigstore.dev/) build-provenance
attestation generated by the release workflow. Together those prove an artifact was built
from this repository, at a named commit, by that workflow — check any download with:

```bash
gh attestation verify <artifact> --repo MARKXAILABS/hello-markx
```

**They do not stop SmartScreen.** The Windows installers are unsigned and Windows will show
its "unrecognised app" warning; macOS is unsigned too, so Gatekeeper needs a right-click →
*Open* (or `xattr -d com.apple.quarantine <app>`). Suppressing either needs a paid signing
certificate — Azure Trusted Signing, an EV certificate, or the Apple Developer Program — and
this project runs at zero recurring cost, so it buys none of them. Provenance is what it
delivers instead, and it is a different guarantee: it tells you where a file came from, not
that an operating system vendor vouches for it.

### Prerequisites

- **macOS, Windows, or Linux**.
- **Node.js 20 or 22** and npm (Node 24 is not supported yet — see
  [`CONTRIBUTING.md`](./CONTRIBUTING.md)).
- A **C/C++ toolchain** for the native addons (`node-pty`, `better-sqlite3`).
- At least one supported agent CLI on your `PATH` — Claude Code (`claude`) is the default.
  Most missing CLIs self-heal: the harness runs the installer in the terminal and continues.
- *Optional:* your own API keys and local LLMs in **Settings → AI Engines**.
- *Optional:* the semantic memory index for cross-session recall — markdown memory works without it.

### Install & run

```bash
git clone https://github.com/MARKXAILABS/hello-markx.git
cd hello-markx
npm install        # postinstall rebuilds node-pty against Electron's ABI
npm run dev        # launches the Electron app with hot reload
```

On first launch you'll go through the onboarding wizard, then land on the floor. Use
**Add agent** to spawn your first session — the orchestrator seats itself automatically.

### Other scripts

```bash
npm run build         # production build via electron-vite
npm run typecheck     # type-check the node (main/preload) and web (renderer) projects
npm test              # the whole node:test suite — this is what CI gates on
npm run test:focused  # a hand-picked subset for tight edit loops, never a gate
npm run dist          # package installers with electron-builder
```

## Architecture

Two data planes feed one renderer:

```
┌───────────────────────────────────────────────────────────────┐
│                     Electron Renderer (React)                  │
│   ┌──────────────────┐    ┌──────────────────────────────┐    │
│   │ Office Floor      │    │ Terminal + Command Bar       │    │
│   │ (Pixi.js)        │    │ Files + Git tabs (xterm.js)  │    │
│   └─────────▲────────┘    └────────────▲─────────────────┘    │
│             │ avatar state             │ pty bytes / fs / git  │
└─────────────┼──────────────────────────┼───────────────────────┘
              │ IPC (contextBridge: window.cth)
       ┌──────┴──────────┐        ┌──────┴─────────────┐
       │  Event Plane    │        │  Terminal Plane    │
       │  hooks / hive   │        │  node-pty PTYs     │
       │  router + god   │        │  + fs + git        │
       └────────▲────────┘        └──────▲─────────────┘
                │ hook payloads          │ stdin / stdout
                └─────────┬──────────────┘
                   ┌──────┴──────────────┐
                   │ claude / agy / codex│
                   └─────────────────────┘
```

- **Terminal plane.** The main process owns a `PtyManager` that spawns each agent as a
  `node-pty` process and streams output over per-id IPC. The renderer talks only through a
  typed `window.cth` bridge ([`src/preload/index.ts`](./src/preload/index.ts)), which also
  exposes filesystem and git helpers.
- **Hive / event plane.** `hive.ts` is the on-disk multi-agent layer; `hooks.ts` runs the hook
  server that provider bridges POST lifecycle payloads to. `memory.ts` wraps the semantic
  memory CLI. The router delivers messages, drains provider outboxes, the orchestrator
  adjudicates, and idle/inbox wakeups keep workers draining mail.

## Project structure

```
src/
  main/                      Electron main process (Node)
    index.ts                 window, IPC handlers, agent lifecycle, quit guard
    pty.ts                   node-pty manager (spawn/write/resize/kill/stream)
    hive.ts                  on-disk multi-agent layer (memory, mailboxes, router)
    hooks.ts                 hook server + provider hook shims
    memory.ts / reflect.ts   semantic memory wrapper + memory condensation
    accountPool.ts           Claude account pool (policy, health, failover)
    breaker.ts / control.ts  circuit breaker + HITL gate / steer / stop
    telemetry.ts / usage.ts  OTel collector + usage/cost attribution
    transcript.ts            reads CLI transcripts for real token/cost telemetry
    slack.ts / webhook.ts    inbound triggers (signed) + ephemeral workers
    integrationBroker.ts     write-only secret broker for agent integrations
    skills.ts / updater.ts   skills catalog + auto-update
    realtime*.ts             voice orchestration (OpenAI realtime)
    db.ts / config.ts        SQLite durable store + harness config
    fs.ts / git.ts           filesystem + git bridges
  preload/                   contextBridge → typed window.cth API
  shared/                    types + pure logic shared by main and renderer
  renderer/src/
    App.tsx                  top-level layout + wiring
    design/                  tokens.css / tokens.ts / global.css (design source of truth)
    components/              Command Center, agent cards, settings, kanban, IDE, …
    scene/office/            Pixi office floor: OfficeFloor, Character, Camera, cast, …
    store/ · hooks/          zustand store, event loop, PTY parser
    assets/                  tilesets, maps, character sheets (see ATTRIBUTION.md)
test/                        node:test unit tests
docs/                        technical docs (accounts, message queue, release drops, design)
docs/adr/                    architecture decision records (the standing decisions)
HIVE.md · DESIGN.md          multi-agent layer · visual design
SPEC.md                      superseded — the original tmux-era MVP spec, kept for history
```

## Design system

The aesthetic is **pixel-snapped, chunky, friendly** — SNES-menu chrome over a readable UI.
[`DESIGN.md`](./DESIGN.md) is canonical; every component derives from its tokens. The brand
layers a **maroon** (`#6E1423`) and **gold** (`#F4D35E`) on top for logo and chrome. The
avatars are an office cast, differentiated by hair/skin/shirt recipes.

## Contributing

Contributions are welcome. Start with [`CONTRIBUTING.md`](./CONTRIBUTING.md). The short
version: `npm install && npm run dev`, keep `npm run typecheck` and `npm test` green, and
**derive any new UI from [`DESIGN.md`](./DESIGN.md) tokens**. There are 11 known Windows
failures in the suite (POSIX path assumptions); that is the current baseline, not your change.

## Telemetry

Builds send anonymous usage events **only if a PostHog key is injected at build time**; this
repository ships none, so builds from this source send nothing. The event allowlist and the
opt-outs are documented in [`TELEMETRY.md`](./TELEMETRY.md).

## License

> [!IMPORTANT]
> **Asset licensing.** The bundled pixel art (tilesets, maps, and the base character sheets the
> cast is recolored from) comes from [LimeZu](https://limezu.itch.io/) via
> [`shahar061/the-office`](https://github.com/shahar061/the-office) under the **LimeZu FREE
> VERSION license — non-commercial use only**. The recolored sprites inherit that restriction.
> See [`src/renderer/src/assets/ATTRIBUTION.md`](./src/renderer/src/assets/ATTRIBUTION.md).
> **To commercialize, replace these assets or obtain a paid LimeZu license.**

The **source code** is licensed under the **MIT License** — see [`LICENSE`](./LICENSE). The MIT
grant covers the code only; the non-commercial asset restriction above is carved out in the
`LICENSE` scope note.

Built on [Pixi.js](https://pixijs.com/) · [xterm.js](https://xtermjs.org/) ·
[node-pty](https://github.com/microsoft/node-pty) · [electron-vite](https://electron-vite.org/) ·
[CodeMirror](https://codemirror.net/) · [Monaco](https://microsoft.github.io/monaco-editor/).
