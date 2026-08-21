---
phase: 01-finish-the-floor
plan: 21
subsystem: build-tooling
tags: [floor-16, eslint, react-hooks, ci-gate, flat-config, exhaustive-deps]
requires:
  - "01-01: the draft PR to main (#77) — the only thing that makes CI run for this phase at all"
  - "01-04: the parse-the-YAML idiom in test/ci-config.test.cjs and the js-yaml devDependency it declared"
  - "01-14 … 01-20: the finished renderer tree, so ESLint lints the FINAL source rather than a tree that is about to move under it"
provides:
  - "ESLint as a HARD CI gate at zero warnings — `run: npm run lint` in the typecheck job, script `eslint . --max-warnings 0`"
  - "a flat config whose rule surface is exactly two named rules, asserted through ESLint's own resolver"
  - "the answer to RESEARCH Open Question 1: the whole tree produces NINE findings, not hundreds"
  - "the 13 orphaned eslint-disable comments resolved — 5 deleted, 8 made live and given a reason sentence"
  - "four new parsed assertions in test/ci-config.test.cjs pinning the step, the flag, the failure-swallow count and the rule surface"
affects:
  - "plan 01-22: no collision — UpdateBadge.tsx was not touched, and no test file was committed by this plan"
  - "plan 01-23: FLOOR-16's ROADMAP clause is TRUE; FLOOR-16's requirement checkbox is left Pending, plan 23 owns it"
  - "plan 01-23: line-anchor contract half 1 honoured — FONTSIZE-TOUCHED=0"
  - "every future PR: a third continue-on-error in ci.yml now fails the suite on the PR that adds it"
tech-stack:
  added:
    - "eslint ^9.39.5 (devDependency)"
    - "@typescript-eslint/parser ^8.67.0 (devDependency, parser only — zero rules, no `project` option)"
    - "eslint-plugin-react-hooks ^7.1.1 (devDependency, two rules named explicitly, no preset)"
  patterns:
    - "assert a config through the tool's own resolver, never through a substring search — a preset spread is invisible to grep and fatal to calculateConfigForFile"
    - "resolve a suppression by MEASUREMENT (`--no-inline-config`), never by reading the code"
    - "the gate flag lives in ONE place (the npm script), so local and CI are byte-identical and cannot drift"
    - "drive every new pin RED before trusting it (01-10's rule) — four RED controls, one per assertion"
key-files:
  created:
    - eslint.config.js
  modified:
    - package.json
    - package-lock.json
    - .github/workflows/ci.yml
    - test/ci-config.test.cjs
    - src/main/knowledge.ts
    - src/main/nodeInstall.ts
    - src/main/slack.ts
    - src/renderer/src/ide/monaco.ts
    - src/renderer/src/realtime/CompletionToast.tsx
    - src/renderer/src/components/GitTab.tsx
    - src/renderer/src/components/OnboardingWizard.tsx
    - src/renderer/src/components/TerminalView.tsx
    - src/renderer/src/components/triggers/SchedulesSection.tsx
    - src/renderer/src/components/triggers/WebhooksSection.tsx
    - src/renderer/src/ide/IdePanel.tsx
    - src/renderer/src/components/agentGroups.ts
    - src/renderer/src/hooks/useHive.ts
    - src/renderer/src/scene/office/OfficeFloor.tsx
key-decisions:
  - "ESLint 9, not 10, and the reason is this repo's own engines field — `>=20 <23` admits Node versions ESLint 10 refuses to run on, and a gate a contributor cannot run locally is the defect FLOOR-16 exists to close. npm flags the entire 9.x line deprecated; recorded as a cost with its upgrade path, not hidden."
  - "assumption A1 closed by INSPECTING the installed plugin: eslint-plugin-react-hooks 7.1.1 exposes 29 rules and configs.flat.recommended carries SIXTEEN of them (recommended-latest carries seventeen). Amendment B was load-bearing, not cautionary."
  - "CompletionToast.tsx's directive DELETED on the resolver's word (0 findings), its two-line explanation KEPT — the comment was true, only the directive was dead."
  - "the useHive `config.claudeAccounts` finding fixed at SOURCE (a latest-value configRef) because it was a real stale-closure bug reporting account labels by raw id; the useHive `config` finding suppressed, because the fix there would respawn the orchestrator on any settings change."
  - "the OfficeFloor finding suppressed because the rule's own remedy IS the bug: mountIdRef is a mount-generation counter and bumping the live ref is the point."
  - "the lockfile was written and verified under portable Node v22.23.2 / npm 10.9.8, the pairing CI installs — overriding the plan's 'that rule is dead' clause, because the repo's own history (f8664dd 'regenerate the lockfile with npm 10, not npm 11') and the orchestrator's live warning both contradict it, and the stricter option costs nothing."
patterns-established:
  - "ESLint config: one flat entry, files scoped to src/**/*.{ts,tsx}, rules written longhand, presets forbidden, ignores restricted to generated build output"
  - "cross-file gate assertion: the workflow names the script, the script carries the flag, and the test asserts BOTH halves — because neither half is a gate alone"
requirements-completed: [FLOOR-16]
duration: 40m
completed: 2026-08-21
---

# Phase 01 Plan 21: The Lint Gate Summary

**ESLint is now a hard CI gate at zero warnings, and it is green because the whole tree produces nine findings — every one of which was fixed or individually reviewed — not because any rule, ignore glob or threshold was weakened.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-08-21T15:25Z
- **Completed:** 2026-08-21T16:00Z
- **Tasks:** 4 of 4 (task 4 is a conditional checkpoint; the condition did not fire — see below)
- **Files modified:** 18 created/modified across 5 commits

## THE MEASUREMENT — RESEARCH Open Question 1, closed

Nobody had ever measured how many `exhaustive-deps` findings 131 `useEffect` + 45 `useCallback` +
26 `useMemo` call sites across 130 renderer files produce. It was the phase's single largest
unbounded item. Measured on the whole tree, before any CI gate existed:

```
./node_modules/.bin/eslint . --max-warnings 999 --format json | node -e "…per-rule tally…"

TOTAL 9
{
  '@typescript-eslint/no-var-requires': 2,
  '@typescript-eslint/no-require-imports': 1,
  'react-hooks/exhaustive-deps': 4,
  '@typescript-eslint/no-explicit-any': 1,
  '(unused-disable-directive)': 1
}
```

Itemised (file | line:col | severity | rule | message):

```
src/main/knowledge.ts                          | 22:1    | ERROR | @typescript-eslint/no-var-requires    | Definition for rule '…' was not found.
src/main/nodeInstall.ts                        | 58:3    | ERROR | @typescript-eslint/no-var-requires    | Definition for rule '…' was not found.
src/main/slack.ts                              | 30:1    | ERROR | @typescript-eslint/no-require-imports | Definition for rule '…' was not found.
src/renderer/src/ide/monaco.ts                 | 29:1    | ERROR | @typescript-eslint/no-explicit-any    | Definition for rule '…' was not found.
src/renderer/src/realtime/CompletionToast.tsx  | 80:5    | ERROR | (ruleId null)                         | Unused eslint-disable directive (no problems were reported from 'react-hooks/exhaustive-deps').
src/renderer/src/components/agentGroups.ts     | 122:6   | warn  | react-hooks/exhaustive-deps           | useMemo has an unnecessary dependency: 'repoVersion'.
src/renderer/src/hooks/useHive.ts              | 469:6   | warn  | react-hooks/exhaustive-deps           | useEffect has a missing dependency: 'config'.
src/renderer/src/hooks/useHive.ts              | 1197:6  | warn  | react-hooks/exhaustive-deps           | useEffect has a missing dependency: 'config.claudeAccounts'.
src/renderer/src/scene/office/OfficeFloor.tsx  | 1805:18 | warn  | react-hooks/exhaustive-deps           | The ref value 'mountIdRef.current' will likely have changed by the time this effect cleanup function runs.
```

Five of the nine ARE the orphaned comments themselves. Four are real findings, in three files. The
`(unused-disable-directive)` bucket collects `ruleId: null`, which is also where a fatal parse error
would land — there were none, and every one of the 9 is accounted for above by name.

`--format compact` was never invoked anywhere in this plan. ESLint 9 removed that formatter from
core, and the standalone republish that supplies it is a third-party package outside the RESEARCH
legitimacy audit. The built-in `json` formatter was used instead — it is better for this job anyway,
because it reports unused directives as messages with `ruleId: null`, which is exactly the count
amendment D turns on. `eslint-formatter-compact` appears in neither `dependencies` nor
`devDependencies`:

```
node -e "…if eslint-formatter-compact is in either dependency map, throw…"  ->  OK   (exit 0)
```

## THE DECISION GATE (task 4) — not required, and here is the number that decided it

Task 4's own action text: *"Fire this checkpoint ONLY if task 2 did not reach `npm run lint` exiting
0 inside this plan's budget."* Task 2 reached `npm run lint` exit 0. Recorded selection:
**`proceed-in-plan`**, with the measured count `TOTAL 9` above. Nothing was weakened to get there:
`--max-warnings 0` is intact (D-30), `reportUnusedDisableDirectives: 'error'` is set, nothing was
blanket-suppressed, and no `continue-on-error` was added.

## ESLint 9 vs 10 — the choice, and its honest cost

Taken: **ESLint 9.39.5**. Registry re-verified before install (RESEARCH is only valid to 2026-09-03):

```
npm view eslint dist-tags   -> { es6jsx: '0.11.0-alpha.0', next: '10.0.0-rc.2', maintenance: '9.39.5', latest: '10.9.0' }
npm view eslint repository.url / maintainers.0.name
                            -> git+https://github.com/eslint/eslint.git   /   openjsfoundation
npm view eslint-plugin-react-hooks version repository.url
                            -> 7.1.1   /   git+https://github.com/facebook/react.git
npm view @typescript-eslint/parser version repository.url
                            -> 8.67.0  /   git+https://github.com/typescript-eslint/typescript-eslint.git
```

All three resolve to the publisher and scope the RESEARCH Package Legitimacy Audit recorded
(canonical ESLint / first-party React / canonical typescript-eslint). No STOP condition. All three
are devDependencies; `node -e "…"` confirms **none** appears under `dependencies`.

**Why 9 and not 10.** `package.json` `engines.node` is `">=20 <23"`, which admits Node 20.0–20.18
and 22.0–22.12. ESLint 10.9.0's engines is `^20.19.0 || ^22.13.0 || >=24` — on those Node versions,
versions this package declares it supports, `npm run lint` would not run at all. A gate a
contributor cannot execute locally is the same defect class FLOOR-16 exists to remove. ESLint 9's
`^18.18.0 || ^20.9.0 || >=21.1.0` is a strict superset of the repo's range.

**The cost, stated rather than hidden.** `npm install` prints
`npm warn deprecated eslint@9.39.5: This version is no longer supported.` — and so does every 9.x
(checked 9.39.1 through 9.39.5), because it is the `maintenance` dist-tag's support policy applied
to the whole major, not a security advisory. `npm audit --audit-level=high` is unaffected. The
warning is visible in CI's own Install step and is not being papered over. Upgrade path (filed in
`deferred-items.md`): widen `engines.node` to `^20.19.0 || ^22.13.0 || >=24` — `.nvmrc` is already
`22` and CI's `NODE_VERSION` is `22`, so both already satisfy it — then move to ESLint 10. That is a
package-wide compatibility change, not an executor call inside a lint plan.

Peer ranges check out: `eslint-plugin-react-hooks@7.1.1` peers `… || ^9.0.0 || ^10.0.0`;
`@typescript-eslint/parser@8.67.0` peers `eslint ^8.57.0 || ^9.0.0 || ^10.0.0` and
`typescript >=4.8.4 <6.1.0`, which covers the exact `typescript@5.9.3` pin.

## ASSUMPTION A1, CLOSED — and amendment B was load-bearing, not cautionary

The plugin's README is ambiguous about what `configs.flat.recommended` carries. The installed
package is not. Inspected directly:

```
plugin version: 7.1.1
rules exposed (29): capitalized-calls, component-hook-factories, config, error-boundaries,
  exhaustive-deps, exhaustive-effect-dependencies, fbt, gating, globals, hooks, immutability,
  incompatible-library, invariant, memo-dependencies, memoized-effect-dependencies,
  no-deriving-state-in-effects, preserve-manual-memoization, purity, refs, rule-suppression,
  rules-of-hooks, set-state-in-effect, set-state-in-render, static-components, syntax, todo,
  unsupported-syntax, use-memo, void-use-memo

configs.flat.recommended.rules        (16)
configs.flat.recommended-latest.rules (17)
```

`configs.flat.recommended` carries the two rules this plan wants **plus fourteen React Compiler
rules** — `static-components`, `use-memo`, `preserve-manual-memoization`, `incompatible-library`,
`immutability`, `globals`, `refs`, `set-state-in-effect`, `error-boundaries`, `purity`,
`set-state-in-render`, `unsupported-syntax`, `config`, `gating` — most at `error`.
`recommended-latest` adds `void-use-memo`. Spreading either would have silently adopted a ruleset
D-31 explicitly rejects, and a future minor could add more without anyone editing a file here.

Writing the two rules longhand makes D-28's bounded-surface guarantee a property of **this repo's
config file** rather than of someone else's release notes. Asserted mechanically:

```
node -e "…new ESLint().calculateConfigForFile('src/renderer/src/App.tsx')…"
  -> CONFIG OK react-hooks/exhaustive-deps,react-hooks/rules-of-hooks     (exit 0)

node -e "…comment-strip the config source, then assert on CODE…"
  -> CONFIG SOURCE OK eslint.config.js                                    (exit 0)
```

**Config filename:** `eslint.config.js` with `module.exports`. `package.json` declares no `"type"`,
so a bare `.js` is loaded as CommonJS and an `export default` there would be a syntax error at
config-load time. CJS was chosen over `.mjs` because both new dependencies are `require`-able and it
also satisfies the plan's `must_haves` artifact path literally.

**`ignores`** covers `out/**`, `dist/**`, `.vite/**` and nothing else. ESLint 9 does not read
`.gitignore`, so without it `eslint .` lints the bundles `npm run build` just produced. Every
authored file stays in scope — including all 73 tracked `.js`/`.cjs`/`.mjs` files outside `src/`,
which are parsed with zero rules configured and therefore produce zero findings. This is the one
place a "widen the ignore glob" cheat could have hidden, so it is spelled out: no authored path is
ignored, and the config comment says so.

## AMENDMENT D — the nine suppressions, resolved by the linter, not by reading the code

The plan's 9 + 4 split was **re-derived against live source** (waves 5–7 swept ~60 renderer files
under this plan, and 01-18 recorded that two anchors had moved and been moved back). Live grep at
task start returned exactly 13 sites, 9 + 4, on lines
`84 / 108 / 179 / 80 / 184 / 149 / 252 / 278 / 80` and `22 / 58 / 30 / 29` — identical to what
`CONVENTIONS.md:25-35` recorded, so 01-18's reversal held and no line number had drifted.

The resolver, one command per file (`eslint <file> --no-inline-config --format json`, counting
`react-hooks/exhaustive-deps` messages), run before any edit:

```
src/renderer/src/components/GitTab.tsx                    1
src/renderer/src/components/MemoryGraphPanel.tsx          1
src/renderer/src/components/OnboardingWizard.tsx          1
src/renderer/src/components/TerminalView.tsx              1
src/renderer/src/components/triggers/SchedulesSection.tsx 1
src/renderer/src/components/triggers/WebhooksSection.tsx  1
src/renderer/src/hooks/useRestoreTeam.ts                  1
src/renderer/src/ide/IdePanel.tsx                         1
src/renderer/src/realtime/CompletionToast.tsx             0
```

| # | File | Resolver | Disposition | Finding under it / reason |
|---|------|----------|-------------|---------------------------|
| 1 | `components/GitTab.tsx:84` | 1 | **KEPT** + reason added | missing `refresh`; it is redefined every render, so depending on it clears and re-creates the 4s poll every render — and the poll sets state, so that is once per poll |
| 2 | `components/MemoryGraphPanel.tsx:108` | 1 | **KEPT**, reason already present | missing `graph.edges`, `graph.nodes`, `pinned`; `structKey`/`pinnedKey` capture the relevant graph identity |
| 3 | `components/OnboardingWizard.tsx:179` | 1 | **KEPT** + reason added | missing `home`; depending on it re-runs the moment the field is cleared and writes the suggestion straight back, making the box impossible to empty |
| 4 | `components/TerminalView.tsx:80` | 1 | **KEPT** + reason added | missing `initialLines`; it is a mount-time backfill snapshot, and depending on it disposes and rebuilds the xterm on every new line |
| 5 | `components/triggers/SchedulesSection.tsx:184` | 1 | **KEPT** + reason added | missing `mission.body/intervalMs/label/to`; the scheduler stamping `lastFiredAt` mid-edit would reseed the draft and wipe what you are typing |
| 6 | `components/triggers/WebhooksSection.tsx:149` | 1 | **KEPT** + reason added | missing `hook.schema`; a stored schema changing underneath would overwrite the editor while it is open |
| 7 | `hooks/useRestoreTeam.ts:252` | 1 | **KEPT**, reason already present | missing `restoreTeam`; rebuilt every render but only called from inside the timer, so it is read fresh at call time |
| 8 | `ide/IdePanel.tsx:278` | 1 | **KEPT** + reason added | missing `refreshStatus`; it is declared BELOW `save`, so naming it is a use-before-declaration on the const binding — and it is a `useCallback` keyed on `root`, which `save` already depends on, so the omission cannot make `save` stale |
| 9 | `realtime/CompletionToast.tsx:80` | **0** | **DELETED** | the directive suppressed nothing. `reportUnusedDisableDirectives: 'error'` makes an unused directive a gate failure, so keeping it would fail the gate for a reason unrelated to code quality. Its two-line explanation of WHY the deps array is empty is true and was KEPT; only the dead directive line went |

**Exactly one file ended `findings=0 directives=0`**: `realtime/CompletionToast.tsx`, named here
with its pasted resolver run (`0`, above) so the deletion can never be mistaken for a suppression
quietly dropped. The other eight are live suppressions — the expected outcome — and not one was
rewritten or moved; the six that lacked a sentence gained one **above** the directive, leaving the
directive adjacent to its dependency array.

The four `@typescript-eslint/*` disables (`knowledge.ts:22`, `nodeInstall.ts:58`, `slack.ts:30`,
`monaco.ts:29`) were **deleted**. Forced, not stylistic: ESLint reports *"Definition for rule '…'
was not found"* at ERROR severity on a disable naming a rule no configured plugin provides. Only the
comment line went at each site; `slack.ts`'s ERR_REQUIRE_ESM note and `monaco.ts`'s cast are
untouched.

Pairing criterion — nine `OK` lines, no `MISMATCH`:

```
OK src/renderer/src/components/GitTab.tsx                    findings=1 directives=1
OK src/renderer/src/components/MemoryGraphPanel.tsx          findings=1 directives=1
OK src/renderer/src/components/OnboardingWizard.tsx          findings=1 directives=1
OK src/renderer/src/components/TerminalView.tsx              findings=1 directives=1
OK src/renderer/src/components/triggers/SchedulesSection.tsx findings=1 directives=1
OK src/renderer/src/components/triggers/WebhooksSection.tsx  findings=1 directives=1
OK src/renderer/src/hooks/useRestoreTeam.ts                  findings=1 directives=1
OK src/renderer/src/ide/IdePanel.tsx                         findings=1 directives=1
OK src/renderer/src/realtime/CompletionToast.tsx             findings=0 directives=0
```

```
grep -rn "@typescript-eslint/" src/ --include=*.ts --include=*.tsx | wc -l   ->  0
```

## FIXED AT SOURCE vs SUPPRESSED — stated explicitly, and justified one by one

The whole point of this plan is a gate that is green because the source is clean. Here is the exact
split for the four real findings.

### FIXED (1 of 4) — `useHive.ts:1197`, and it was a real bug

`labelOf` resolved Claude account labels from `config.claudeAccounts` captured inside an effect keyed
on `[config?.onboardingComplete]`. That flag flips once, at first boot, and never again — so the
closure held the config object from that render for the entire process lifetime. **Rename an account
in Settings, or add one, and every failover/resume toast afterwards reported it by raw id**
("switching to acc_7f3a…"), the one string that identifies nothing.

Adding `config.claudeAccounts` to the deps — what the rule literally asks for — would have been the
wrong fix: the effect owns two long-lived IPC subscriptions (`onHiveFailover`,
`onClaudeAccountResumed`) and re-running it on every identity change of the accounts array tears
them down and re-subscribes, including in the middle of the failover it is reporting on.

Fixed with the latest-value ref the rule is designed to be satisfied by: a `configRef` mirrored in
its own effect (not assigned during render, so render stays pure), read at callback time. **The
finding is gone because the dependency is gone, not because it was suppressed** — `useHive.ts:1197`
no longer appears in the lint report. Behaviour change named in commit `4a392bd`; no test asserts
the old behaviour (`grep` over `test/` for `onHiveFailover`/`labelOf` returns nothing), and no test
was modified.

### SUPPRESSED, WITH A REVIEWED REASON (3 of 4)

Three new suppressions beyond the original nine. Zero was the preferred outcome; three is the honest
one. Each is a case where following the rule's advice introduces a defect, each carries a
one-sentence reason in the source, and each names the alternative that was rejected.

**1. `src/renderer/src/components/agentGroups.ts:122`** — *"useMemo has an unnecessary dependency:
'repoVersion'"*. ESLint is right that the body never reads it and wrong that it is unnecessary.
`repoKeyOf`/`repoLabelOf` read the **module-level** `repoRootByCwd` Map that `useResolvedRepoNames`
fills asynchronously and mutates in place; no static analysis can see through that read, and nothing
else in the component changes when the git lookups land. Remove the dependency and every agent stays
bucketed under its raw cwd forever — two checkouts sharing a basename would re-merge, which is the
exact bug the absolute-root keying was written to fix. *Rejected alternative:* thread the resolved
map through `repoKeyOf`/`repoLabelOf`. Those are exported and also called by `groupKey` and
`matchesAgentQuery` — a refactor, not a lint fix.

**2. `src/renderer/src/hooks/useHive.ts:480`** — *"useEffect has a missing dependency: 'config'"*.
This is the effect that **spawns Michael**: it clears any stale registry entry, calls `spawnPty` and
types his orientation prompt. ESLint wants the whole object because `buildSpawnCommand(config, …)`
takes it. Adding it re-runs the effect on every config change, i.e. **respawns the orchestrator
whenever any unrelated setting is saved**, discarding his resumed session and the floor's
situational awareness with it. The two keys that must re-run it are named; the rest are read inside
the 1.2 s timeout, at spawn time, which is the moment their values matter. *Rejected alternative:*
route the whole boot path through the `configRef` added for the fix above — eight reads in the
single most critical path in the app, changing WHEN each value is sampled, with no test covering the
boot sequence. That is a refactor to plan, not to slip into a lint pass.

**3. `src/renderer/src/scene/office/OfficeFloor.tsx:1805`** — *"The ref value 'mountIdRef.current'
will likely have changed by the time this effect cleanup function runs"*. Here the rule's own remedy
is the bug. `mountIdRef` is not a DOM handle; it is a **mount generation counter**, and bumping the
live ref is the entire point — the async `init().catch` compares `mountIdRef.current` against the
`mountId` it captured and bails when they differ. Bump a captured copy instead and a failed init
belonging to a torn-down mount paints its error banner into the new one. Not fixable by copying,
because copying is what breaks it.

**Zero `rules-of-hooks` errors were found**, so none was suppressed — the rule that `tsc --strict`
structurally cannot model reports the tree clean.

**Nothing was suppressed to reduce a number.** The final directive census in `src/` is
**11 = 8 + 3**: the eight surviving originals plus these three, every one with an adjacent reason.

## THE GATE

`.github/workflows/ci.yml`, `typecheck` job, after the typecheck step:

```yaml
      - name: Lint (react-hooks, zero warnings)
        run: npm run lint
```

`package.json`: `"lint": "eslint . --max-warnings 0"`. The flag lives **only** there — one gate, one
definition, byte-identical locally and in CI. `--max-warnings 0` is load-bearing (D-30): both
`exhaustive-deps` and unused-directive reporting default to warning severity, and
`reportUnusedDisableDirectives: 'error'` in the config is the belt to that braces.

```
npm run lint
> eslint . --max-warnings 0
                                                    exit 0

grep -cE "^ *run: *npm run lint *$" .github/workflows/ci.yml       -> 1
node -e "…lint script must invoke eslint AND carry --max-warnings 0…"
                                                    -> LINT SCRIPT OK eslint . --max-warnings 0   (exit 0)
grep -cE "^[^#]*continue-on-error: *true" .github/workflows/ci.yml -> 2
```

**The `continue-on-error` count is 2 and is now pinned by a parsed test.** Recorded here as the plan
requires: **2**, the pre-existing number — the advisory `npm audit` in `typecheck` and the
historically flaky `electron-rebuild` in `build`, both documented inline with their reason. No third
was added. The raw string appears **4** times in the file; two are comments explaining why there is
no `continue-on-error` there, which is why the test counts parsed declarations and never raw
occurrences (this is 01-04's rule, extended, not regressed to grep).

## `test/ci-config.test.cjs` — four new parsed assertions, all four proven RED

Extended in 01-04's parse-then-compare idiom, not by string-matching a literal:

1. the `typecheck` job runs exactly one `npm run lint` step, and neither that step nor the job
   carries `continue-on-error`;
2. `package.json`'s `lint` script invokes eslint **and** carries `--max-warnings 0`, and eslint is a
   devDependency and not a runtime one. The assertion crosses two files deliberately: the workflow
   names the script, the script carries the flag, and neither half is a gate alone. Grepping
   `ci.yml` for `max-warnings` would return `0` on a fully correct implementation and fail the right
   answer;
3. exactly **two** parsed `continue-on-error: true` declarations exist across `ci.yml`;
4. the flat config resolves — through **ESLint's own resolver**, not a substring search — to exactly
   `[react-hooks/exhaustive-deps, react-hooks/rules-of-hooks]` with a TypeScript parser present. A
   preset spread is invisible to a grep and fatal to this assertion, which is the point.

A pin that cannot go red is decoration, so each was driven RED, one at a time, and restored:

```
delete the Lint step from ci.yml                       -> pass 0 / fail 1
drop --max-warnings 0 from the lint script             -> pass 0 / fail 1
add a third continue-on-error                          -> pass 0 / fail 1
spread reactHooks.configs.flat.recommended into it     -> pass 0 / fail 1
restored                                               -> tests 13 / pass 13 / fail 0
```

TAP counters, through the tap reporter on purpose (`node --test` counts SKIPPED tests in `# tests`
and still exits 0, so an exit code plus a test count is satisfiable by four `{skip}` stubs):

```
TAP=$(mktemp); node --test --test-reporter=tap test/ci-config.test.cjs > "$TAP"; echo "EXIT=$?"; grep -E "^# (tests|pass|fail|skipped|todo) " "$TAP"; rm -f "$TAP"

EXIT=0
# tests 13
# pass 13
# fail 0
# skipped 0
# todo 0
```

Plan 04's recorded number for this file was **9 tests / 9 pass** (the pre-phase baseline on the
untouched file was 3/3). Mine is **13 / 13** — a delta of **+4**, with `# fail 0` and `# skipped 0`.

## CONTAINMENT AND THE LINE-ANCHOR CONTRACT

Base commit recorded at task 2 start: **`e183a93813114acd77765d42081c1597ab7839d1`**.

Task 2's code commits (the space-separated list the criterion binds):
**`37790d35fe2102dd499ba1638466fa72372cadc5 4a392bd28633257d86ab21852d37bf078ad995b0 34dbe78c587696b6be9cc40dbba7dfe3d3dc2ce6`**

Line-anchor contract, half 1 — the command binds its own `BASE` and ends in a counter, so an unbound
variable cannot pass:

```
B=e183a93813114acd77765d42081c1597ab7839d1; git rev-parse --verify "$B^{commit}" >/dev/null 2>&1 || { echo "FAIL: BASE is not a commit - re-derive it"; exit 1; }; echo "FONTSIZE-TOUCHED=$(git diff -U0 "$B" -- src/renderer/src | grep -E "^[-+]" | grep -cE "fontSize *[:=]")"

FONTSIZE-TOUCHED=0
```

This plan moved no `fontSize` text, so plan `01-23`'s content-keyed FLOOR-12 allowlist stays
derivable. Line numbers below the eight edited suppression sites HAVE shifted by 2–4 lines (the
reason sentences), which is exactly what half 2 of the contract exists to absorb: plan 23 keys on
content and re-derives at wave 9.

Containment, asserted per-commit (not tree-wide, because plan `01-22` commits into this same tree in
this same wave):

```
S="37790d35fe2102dd499ba1638466fa72372cadc5 4a392bd28633257d86ab21852d37bf078ad995b0 34dbe78c587696b6be9cc40dbba7dfe3d3dc2ce6"; …verify each SHA…; echo "COMMITS=$(set -- $S; echo $#) OUT-OF-BOUND=$n"

COMMITS=3 OUT-OF-BOUND=0
```

The actual touched set (14 files, all inside `src/main/{knowledge,nodeInstall,slack}.ts` +
`src/renderer/src/**/*.{ts,tsx}`):

```
S="37790d3… 4a392bd… 34dbe78…"; for sha in $S; do git show --stat "$sha"; done

commit 37790d3 refactor(01-21): resolve the 13 orphaned eslint-disable comments by measurement
 src/main/knowledge.ts                                     | 1 -
 src/main/nodeInstall.ts                                   | 1 -
 src/main/slack.ts                                         | 1 -
 src/renderer/src/components/GitTab.tsx                    | 3 +++
 src/renderer/src/components/OnboardingWizard.tsx          | 3 +++
 src/renderer/src/components/TerminalView.tsx              | 3 +++
 src/renderer/src/components/triggers/SchedulesSection.tsx | 3 +++
 src/renderer/src/components/triggers/WebhooksSection.tsx  | 2 ++
 src/renderer/src/ide/IdePanel.tsx                         | 4 ++++
 src/renderer/src/ide/monaco.ts                            | 1 -
 src/renderer/src/realtime/CompletionToast.tsx             | 1 -
 11 files changed, 18 insertions(+), 5 deletions(-)

commit 4a392bd fix(01-21): report Claude account labels from the LATEST config, not a mount-time closure
 src/renderer/src/hooks/useHive.ts | 13 ++++++++++++-
 1 file changed, 12 insertions(+), 1 deletion(-)

commit 34dbe78 refactor(01-21): review and document the three findings the rule cannot see through
 src/renderer/src/components/agentGroups.ts    | 12 +++++++++++-
 src/renderer/src/hooks/useHive.ts             |  9 +++++++++
 src/renderer/src/scene/office/OfficeFloor.tsx |  8 ++++++++
 3 files changed, 28 insertions(+), 1 deletion(-)
```

No `test/*.test.cjs` appears in that list — **no test was modified to accommodate a lint fix**, and
the containment filter proves it structurally rather than by assertion.

**Wave-mate coupling with plan `01-22`:** no collision. `UpdateBadge.tsx` — the one component in
plan 22's candidate set that contains hooks, and therefore the only possible overlap — was not
touched, and neither was any other file plan 22 asserts on.

## THE LOCKFILE — and a deliberate override of the plan's text

`package.json` gained three devDependencies, so `package-lock.json` changed. The plan states the
"npm 10 under Node 22" rule is dead and must not be reinstated. **It was reinstated anyway, and the
reason is evidence, not preference:**

- the orchestrator's live brief names this as the single most dangerous item on this host, with a
  specific failure (an npm-11-written lockfile silently dropping peer deps npm 10 still expects) and
  a specific precedent (plan 01-01 burned a full red CI round on exactly it);
- the repo's own history agrees — commit `f8664dd` is literally *"ci: regenerate the lockfile with
  npm 10, not npm 11"*, and `1858bfc` is *"add Playwright to the lockfile, with npm 10"*;
- the plan's stated justification for withdrawing the rule was *"this host is node v24.13.0 /
  npm 11.6.2 with **no Node 22 installed**, which made the instruction unfollowable here."* That
  premise is **false as of today**: a portable Node 22.23.2 / npm 10.9.8 is installed at
  `~/AppData/Local/nodejs-22`, which is the exact pairing CI's `setup-node` installs.
- it costs nothing, and it is strictly a superset of the plan's own checks.

Writer, recorded as a fact:

```
node --version && npm --version
v22.23.2
10.9.8
```

Discriminating checks, all pasted:

```
node -e "console.log(require('./package-lock.json').lockfileVersion)"   -> 3

npm ci --dry-run --ignore-scripts        (under npm 10.9.8)            -> exit 0
npm ci --ignore-scripts                  (under npm 10.9.8)            -> exit 0
sha256 of the lockfile npm ci consumed:  ca6f96d6e7d1a9af86b0e46d6d525ce49bbd49051bafb1897f6b772c61a401f3
sha256 of the committed lockfile:        ca6f96d6e7d1a9af86b0e46d6d525ce49bbd49051bafb1897f6b772c61a401f3
git diff --exit-code package-lock.json                                 -> exit 0
```

The lockfile was regenerated by `npm install --save-dev --ignore-scripts` on a clean tree, never
hand-edited. `--ignore-scripts` on the install deliberately skips this package's own `postinstall`
(`electron-rebuild -f`), which is not needed to resolve a lockfile and which the orchestrator's
brief explicitly warns against provoking. **No `npm rebuild better-sqlite3` was added anywhere.**

## CI — verified by SHA, not by branch tip

Draft PR: <https://github.com/MARKXAILABS/hello-markx/pull/77>

```
gh pr view --json url,isDraft,baseRefName,headRefName,number
{"baseRefName":"main","headRefName":"gsd/v1.0-milestone","isDraft":true,"number":77,
 "url":"https://github.com/MARKXAILABS/hello-markx/pull/77"}
```

Pushed `5a6234c..e6067eb`. The workflow run's own head SHA confirms which commit was tested:

```
gh run view 32500364881 --json headSha  ->  e6067eb6c52de15c30d626b34d07892a9be82bc6
```

```
gh pr checks 77

Build                          pass  52s
CodeRabbit                     pass  0     Review skipped: draft pull request
Electron smoke (ubuntu-latest) pass  1m39s
Test (macos-latest)            pass  38s
Test (ubuntu-latest)           pass  50s
Test (windows-latest)          pass  1m24s
Typecheck                      pass  42s
```

All six job rows green, plus the lint step **inside** `Typecheck` — proven from the job's own step
list and log rather than inferred from the job's colour:

```
gh api …/actions/jobs/96828391397 --jq '.head_sha, (.steps[] | "\(.number). \(.name) — \(.conclusion)")'
e6067eb6c52de15c30d626b34d07892a9be82bc6
4. Install dependencies — success
5. Typecheck (node + web) — success
6. Lint (react-hooks, zero warnings) — success
7. npm audit (high and above) — success

…job log…
Typecheck  Lint (react-hooks, zero warnings)  ##[group]Run npm run lint
Typecheck  Lint (react-hooks, zero warnings)  > hello-markx@0.4.4 lint
Typecheck  Lint (react-hooks, zero warnings)  > eslint . --max-warnings 0
```

That is the gate running green on **Linux / Node 22**, not just on this Windows host.

Re-verified after the bookkeeping commits, at branch tip `9cbace7e730f4057372050bb2e04f8054b949c58`:
all six job rows `success` again, `Lint (react-hooks, zero warnings) — success` inside `Typecheck`
(run 32501433890, job 96831773599). The code SHA `e6067eb` above is the one that matters — the
commits between it and `9cbace7` touch only `.planning/`, which no workflow reads.

## LOCAL GATES

```
npm run lint       exit 0
npm run typecheck  exit 0
npm test           tests 519 / pass 515 / fail 0 / skipped 4 / todo 0   (baseline 515/511/0/4)
```

The +4 is exactly this plan's four new tests. **Zero failures, and there is no "pre-existing Windows
failures" baseline to hide behind.**

## must_haves — every truth, answered

| Truth | Verdict | Evidence |
|---|---|---|
| ESLint runs as a hard CI gate at zero warnings, **or** the 13 orphans are gone — and in fact both | **SATISFIED (both)** | `run: npm run lint` in `typecheck`, script `eslint . --max-warnings 0`, `Lint` step `success` on `e6067eb`; 13 orphans resolved (5 deleted, 8 made live) |
| Every one of the 9 `exhaustive-deps` disables resolved by measurement — kept where ESLint still reports the finding, deleted where it reports the directive unused | **SATISFIED** | nine-line resolver output + nine `OK` pairing lines above; 8 kept, `CompletionToast.tsx` deleted on a pasted `0` |
| The 4 `@typescript-eslint/*` disables are deleted | **SATISFIED** | `grep -rn "@typescript-eslint/" src/ … \| wc -l` → `0` |
| The rule surface is exactly two named rules — no preset, no React Compiler rule set, no typescript-eslint ruleset | **SATISFIED** | `CONFIG OK react-hooks/exhaustive-deps,react-hooks/rules-of-hooks`; `CONFIG SOURCE OK eslint.config.js`; pinned by a test proven RED against a real preset spread |
| The finding count was measured and pasted before the gate was committed | **SATISFIED** | `TOTAL 9` + per-rule object measured at commit `e183a93` (config + script only, no CI gate); the gate landed two commits later at `e6067eb` |

| Artifact / link | Verdict |
|---|---|
| `eslint.config.js` — flat config with a parser and exactly two explicitly named rules, containing `rules-of-hooks` | **SATISFIED** |
| `.github/workflows/ci.yml` — a lint step in the typecheck job invoking `npm run lint`, whose script carries `--max-warnings 0` | **SATISFIED** |
| the 9 disables → the configured `exhaustive-deps` rule, via the rule becoming real | **SATISFIED for 8; the 9th became an unused-directive report and was deleted**, which is amendment D operating exactly as written |
| wave-8 edits → plan 23's allowlist, via "this plan changes no line matching M1" | **SATISFIED** — `FONTSIZE-TOUCHED=0` |

## Deviations from Plan

### 1. [Rule 3 — blocking] Four orphaned Electron processes broke `npm ci` and had to be killed

**Found during:** task 1. `npm ci --ignore-scripts` deleted `node_modules/` and then failed
`EPERM: unlink 'node_modules/electron/dist/dxil.dll'`, leaving the tree unusable (85 entries, no
`eslint`, no `vite`). A retry via `npm install` failed the same way on
`dist/resources/default_app.asar` (`EBUSY`).

**Cause:** four live `electron.exe` processes running
`node_modules/electron/dist/electron.exe probe/main.js`, started 18:27 local — leftover CDP probe
harnesses from an earlier wave, not the operator's app (which would run `out/main/index.js`).

**Fix:** identified them by command line first (`Get-CimInstance Win32_Process`), confirmed they were
probe harnesses, killed them, re-ran `npm ci --ignore-scripts` → exit 0, 579 entries restored, and
restored the Electron-ABI `node-pty/build/Release/*.node` binaries from a pre-flight backup so the
dev app and `npm run e2e` are exactly as they were. Verified by `npm test` returning the untouched
515/511/0/4 baseline afterwards. Filed in `deferred-items.md` so the probe harnesses learn to exit.

### 2. [Deliberate override] The lockfile was written under npm 10.9.8, against the plan's text

Documented in full under **THE LOCKFILE** above. Short form: the plan withdrew the npm-10 rule on a
premise ("no Node 22 installed on this host") that is no longer true, and both the repo's own commit
history and the orchestrator's live brief say the rule is real. Overriding toward the stricter,
evidence-backed option. All three of the plan's own discriminating checks were run and pasted as
well, so nothing the plan asked for was skipped — only added to.

### 3. [Reported, not acted on] Six foreign untracked files in the repo root

`c.ts`, `inv.ts`, `pre.ts`, `pred.ts`, `sig.ts`, `f5/wrapped.ts` appeared during this plan's window.
Their contents are wrapped/multi-line source fixtures (a multi-line signature, a wrapped `if`, a
wrapped `ipcRenderer.invoke`, a multi-line `import`) — i.e. somebody testing whether an assertion
survives line wrapping. Nothing this plan ran writes them and nothing in `test/` names them. **Not
staged, not deleted** — deleting another agent's working files is the exact destruction the executor
rules forbid. Filed in `deferred-items.md`.

### 4. [Plan text corrected by live measurement] The 9 + 4 split and its line numbers

The plan warned the anchors may have moved under waves 5–7. Re-derived from live source: they had
not — 01-18 moved two and moved them back, and all 13 sites sit exactly where `CONVENTIONS.md`
recorded them. Reported as confirmed rather than assumed.

### 5. [Scope, stated rather than silently accepted] `eslint .` does not cover TS outside `src/`

The config's single entry is `files: ['src/**/*.{ts,tsx}']`, so `e2e/*.ts`, `playwright.config.ts`
and `electron.vite.config.ts` are linted by nothing. Harmless today (the two rules are React-hooks
rules) but it is a real scope statement and is filed in `deferred-items.md` rather than left for
someone to discover as a surprise.

**No authentication gates occurred.**

## Known Stubs

None. Nothing in this plan renders, and no placeholder, empty-value or "coming soon" path was
introduced.

## Threat Flags

None. This plan added no network endpoint, auth path, file-access pattern or schema change. The
three packages added are build-time devDependencies dispositioned **Approved** in the RESEARCH
Package Legitimacy Audit and re-verified against the registry at execution time (publisher and scope
pasted above); `@typescript-eslint/parser` is configured with no `project` option, so no type-aware
linting cost is incurred (T-P21-06, disposition `accept`, holds as written).

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `e183a93` | `chore(01-21): configure ESLint with exactly two rules, and measure before gating` |
| 2 | `37790d3` | `refactor(01-21): resolve the 13 orphaned eslint-disable comments by measurement` |
| 3 | `4a392bd` | `fix(01-21): report Claude account labels from the LATEST config, not a mount-time closure` |
| 4 | `34dbe78` | `refactor(01-21): review and document the three findings the rule cannot see through` |
| 5 | `e6067eb` | `ci(01-21): make lint a hard gate in the typecheck job, and pin the gate itself` |

## Outstanding

- **FLOOR-16's requirement checkbox is deliberately left `Pending`** — plans 01-02 … 01-20 all left
  theirs, and plan `01-23` owns the whole traceability pass. The ROADMAP criterion-5 lint clause is
  now TRUE and the evidence for it is this document.
- **Issue #36 is NOT closed, and the plan's success criterion saying it would be is factually
  unsatisfiable on correct work.** #36 carries FOUR Fix clauses, not one. Verified live: clause 1
  (dependabot + an audit step) is CLOSED — `.github/dependabot.yml` exists and `ci.yml:49-54` runs
  `npm audit --audit-level=high`; clause 2 (adopt ESLint / strip the orphaned disables) is CLOSED by
  this plan, and both halves were done; clause 3 (delete the duplicate script) is CLOSED —
  `tools/copy-main-assets.cjs` no longer exists; clause 4 (extract one tunnel helper) is **OPEN** —
  `slack.ts:191/210` and `webhook.ts:257/276` still each carry a private `listen()` and
  `openTunnel()`, and both files repeat the same ERR_REQUIRE_ESM note, which is the duplication the
  clause names. Neither file is in this plan's declared bound and no phase-1 plan owns that work.
  Per D-42/D-44 — the same call 01-03 made on #18 and 01-11 made on #10 — a **per-clause evidence
  comment** was posted and the issue was left OPEN rather than closed on 3-of-4:
  <https://github.com/MARKXAILABS/hello-markx/issues/36#issuecomment-5372297276>. It carries the Fix
  text clause by clause, one command per clause with pasted output, the measured finding count, the
  four named tests, and the `node --test` exit line.
- The ESLint 9 → 10 upgrade path, the six foreign root files, the `src/`-only lint scope and the
  orphaned probe processes are all filed in `deferred-items.md`.

## Self-Check: PASSED

```
files:    FOUND eslint.config.js / package.json / package-lock.json /
                .github/workflows/ci.yml / test/ci-config.test.cjs / 01-21-SUMMARY.md
commits:  FOUND e183a93 / 37790d3 / 4a392bd / 34dbe78 / e6067eb

grep -cE "^ *(npx )?eslint .*--format[ =]compact" 01-21-SUMMARY.md   -> 0
node -e "…eslint-formatter-compact in neither dependency map…"       -> OK (exit 0)
```
