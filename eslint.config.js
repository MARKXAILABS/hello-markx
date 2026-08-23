/**
 * ESLint flat config. Two rules. On purpose, and it must stay that way.
 *
 * WHY THIS FILE EXISTS AT ALL
 * This repo shipped for its whole life with no linter (CONVENTIONS.md recorded
 * "No linter configured") while carrying 13 `eslint-disable` comments in source.
 * A disable comment that no linter reads is worse than no comment: it reads like
 * a reviewed exception and is actually inert, so a real dependency bug can hide
 * under one forever. FLOOR-16 makes them mean something.
 *
 * WHY A PARSER WITH (ALMOST) NO RULES
 * ESLint's default parser is espree, and espree cannot parse a TypeScript type
 * annotation. Without @typescript-eslint/parser below, ESLint would fail to
 * parse every file in src/ and would therefore lint NOTHING - a green gate that
 * checks nothing, which is the exact failure mode this file was added to remove.
 * The parser is present as a PARSER ONLY: no `project` option is set, so no type
 * information is requested, no type-aware linting cost is paid, and not one rule
 * from the typescript-eslint ruleset is adopted. Zero rules from it means zero
 * findings from it.
 *
 * WHY THE TWO RULES ARE WRITTEN OUT LONGHAND AND NO PRESET IS SPREAD IN
 * eslint-plugin-react-hooks v7 does not mean what v5 meant. Measured against the
 * installed 7.1.1 on 2026-08-21: the plugin exposes 29 rules, and BOTH of its
 * flat presets carry 16 (or 17) of them - the two below plus the React Compiler
 * set (static-components, use-memo, preserve-manual-memoization, immutability,
 * globals, refs, set-state-in-effect, set-state-in-render, error-boundaries,
 * purity, unsupported-syntax, incompatible-library, config, gating, and
 * void-use-memo in the -latest variant), most of them at "error". Spreading a
 * preset here would silently adopt ~14 extra rules the project never agreed to,
 * and a future minor of the plugin could add more without anyone editing this
 * file. Naming the two rules explicitly makes the bounded surface a property of
 * this file rather than a property of someone else's release notes.
 * test/ci-config.test.cjs asserts the count, so a preset swap fails the suite.
 *
 * WHY reportUnusedDisableDirectives IS "error"
 * Both rules below can report at warning severity, and so does an unused
 * directive by default. The gate is `eslint . --max-warnings 0` (see the `lint`
 * script in package.json) precisely so a warning cannot be waved through. The
 * setting is scoped to this entry - it only fires where rules actually run, so
 * it can never flag a directive in a file that has no rules to suppress.
 *
 * DO NOT "SIMPLIFY" THIS FILE by replacing the two rules with a preset, by
 * dropping the parser, or by widening `ignores`. Each of those turns the gate
 * into decoration.
 */
const tsParser = require('@typescript-eslint/parser');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = [
  {
    // Build output only - `out/` and `dist/` are gitignored artifacts of
    // `npm run build`, not authored code. ESLint 9 does not read .gitignore, so
    // without this it would lint the bundles it just produced. Nothing authored
    // is ignored here, and nothing authored may be added to this list.
    ignores: ['out/**', 'dist/**', '.vite/**'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
