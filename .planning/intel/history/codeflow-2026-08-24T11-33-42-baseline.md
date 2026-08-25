# CodeFlow Snapshot — baseline

- **Project:** `E:\munder-difflin`
- **Captured:** 2026-08-24T11:33:42.058Z

## Health

- **Score:** 58/100 (Grade F)
- **Files analyzed:** 365 (311 code, 54 other)
- **Functions:** 1625
- **Unused functions:** 17
- **Connections:** 3371

## Architecture Issues

- **Circular dependencies:** 0
- **Layer violations:** 392
- **Duplicate / similar blocks:** 10
- **Dead functions:** 17

## Security

- **HIGH:** 45
- **MEDIUM:** 59
- **LOW / other:** 17

### HIGH severity findings (top 10)
- `electron-builder.yml` — finding
- `resources/phone/index.html` — finding
- `resources/skills/md-hive-sync/SKILL.md` — finding
- `src/main/config.ts:552` — finding
- `src/main/config.ts:553` — finding
- `src/main/config.ts:554` — finding
- `src/main/config.ts:555` — finding
- `src/main/hive.ts` — finding
- `src/main/hive.ts` — finding
- `src/main/memory.ts` — finding

## Patterns in use

- **Factory:** 1
- **Observer/Event:** 1
- **Custom Hooks:** 1
- **Context Provider:** 1
- **God Object:** 1
- **Long File:** 1
- **VBA God Module:** 1

_Codex/Opus: match these patterns in new code; do not introduce competing ones._

## Prioritised Actions (from CodeFlow Actions tab)

### CRITICAL
- **Break Circular Dependencies** — Extract shared code to a new module or use dependency injection
- **Fix Security Issues** — Address hardcoded secrets, injection risks immediately

### HIGH
- **Remove Dead Code** — Review unused functions in the Issues panel
- **Split Large Files** — Group related functions and extract to separate modules
- **Extract Duplicated Code** — Create shared utility functions
- **Fix Architecture Violations** — Invert dependencies or use interfaces/events

### MEDIUM
- **Reduce Coupling** — Review if these should be split or if importers should be consolidated
- **Resolve Naming Conflicts** — Rename functions to be more specific or consolidate into shared module

## Languages

- **undefined:** NaN%
- **undefined:** NaN%
- **undefined:** NaN%
- **undefined:** NaN%
- **undefined:** NaN%
- **undefined:** NaN%
- **undefined:** NaN%
- **undefined:** NaN%
- **undefined:** NaN%
- **undefined:** NaN%
