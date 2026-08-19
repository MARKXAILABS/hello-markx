# Hello MarkX v0.4.4

**A local office of AI coding agents that run themselves** — Claude Code, Codex, Antigravity,
Grok, Kimi, Qwen, OpenCode, Crush, pi and Copilot, messaging, routing and remembering, coordinated
by an orchestrator you talk to. Local-first and open source.

---

## What's new in 0.4.4

**This is the first release under the Hello MarkX name.** The app, its updater and its release
pipeline now live in this repository.

### Claude account pool

- **Register any number of Claude subscriptions** (`claude setup-token`) and pin any agent —
  the orchestrator included — to one. Per-account live token usage and an integrity check live
  in the Command Center.
- **Pinned or Auto.** Unpinned Claude agents pick the healthy account with the fewest tokens in
  the last five hours at each (re)spawn.
- **Automatic failover.** A rate-limited account cools down and its running agents move to the
  next healthy account with `--resume`; a dead token is flagged until you replace it. All
  accounts cooling → agents pause with a countdown and resume on their own.

### Also in this line

- Skills browser, Prerequisites page, release drops, a rebuilt dark mode, and agents that can
  finally message each other on Windows.

---

## Download

| Platform | File |
|---|---|
| macOS (universal) | [`Hello-MarkX-0.4.4-mac-universal.dmg`](https://github.com/MARKXAILABS/hello-markx/releases/latest/download/Hello-MarkX-0.4.4-mac-universal.dmg) |
| Windows (installer) | [`Hello-MarkX-0.4.4-win-x64-setup.exe`](https://github.com/MARKXAILABS/hello-markx/releases/latest/download/Hello-MarkX-0.4.4-win-x64-setup.exe) |
| Windows (portable) | [`Hello-MarkX-0.4.4-win-x64-portable.exe`](https://github.com/MARKXAILABS/hello-markx/releases/latest/download/Hello-MarkX-0.4.4-win-x64-portable.exe) |
| Linux (AppImage) | [`Hello-MarkX-0.4.4-linux-x86_64.AppImage`](https://github.com/MARKXAILABS/hello-markx/releases/latest/download/Hello-MarkX-0.4.4-linux-x86_64.AppImage) |
| Source | [`v0.4.4.tar.gz`](https://github.com/MARKXAILABS/hello-markx/archive/refs/tags/v0.4.4.tar.gz) |

Checksums for every artifact are in `SHA256SUMS.txt` on the release.
