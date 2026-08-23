# CodeFlow Snapshot — final

- **Project:** `E:\munder-difflin`
- **Captured:** 2026-08-22T23:17:30.430Z

## Health

- **Score:** 62/100 (Grade D)
- **Files analyzed:** 340 (286 code, 54 other)
- **Functions:** 1449
- **Unused functions:** 16
- **Connections:** 2598

## Architecture Issues

- **Circular dependencies:** 0
- **Layer violations:** 281
- **Duplicate / similar blocks:** 9
- **Dead functions:** 16

## Security

- **HIGH:** 37
- **MEDIUM:** 46
- **LOW / other:** 16

### HIGH severity findings (top 10)
- `resources/skills/md-hive-sync/SKILL.md` — finding
- `src/main/config.ts:526` — finding
- `src/main/config.ts:527` — finding
- `src/main/config.ts:528` — finding
- `src/main/config.ts:529` — finding
- `src/main/hive.ts` — finding
- `src/main/hive.ts` — finding
- `src/main/memory.ts` — finding
- `src/main/pty.ts` — finding
- `src/main/shellEnv.ts` — finding

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
