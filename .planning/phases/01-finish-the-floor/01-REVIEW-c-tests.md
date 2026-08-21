---
phase: 01-finish-the-floor
slice: c-tests-ci-build-docs
reviewed: 2026-08-21T23:40:00Z
depth: deep
files_reviewed: 38
files_reviewed_list:
  - test/ci-config.test.cjs
  - test/db-fts.test.cjs
  - test/delivery-main.test.cjs
  - test/engine-parity.test.cjs
  - test/hive-durability.test.cjs
  - test/hive-protocol-v2.test.cjs
  - test/hive-roster-injection.test.cjs
  - test/hive-task-mutation.test.cjs
  - test/hook-auth-roundtrip.test.cjs
  - test/hooks-notify.test.cjs
  - test/load-ts.cjs
  - test/net-binding.test.cjs
  - test/proc-kill.test.cjs
  - test/queue-delivery.test.cjs
  - test/renderer-components.test.cjs
  - test/renderer-runstate.test.cjs
  - test/repo-claims.test.cjs
  - e2e/smoke.spec.ts
  - tools/patch-electron-builder-cycle.cjs
  - eslint.config.js
  - package.json
  - electron-builder.yml
  - .github/workflows/ci.yml
  - .github/workflows/e2e.yml
  - .github/workflows/release.yml
  - .github/ISSUE_TEMPLATE/bug_report.yml
  - README.md
  - SECURITY.md
  - CONTRIBUTING.md
  - RELEASE.md
  - HIVE.md
  - DESIGN.md
  - docs/message-queue.md
  - docs/adr/0001-one-gate-for-pty-writes.md
  - docs/adr/0005-cumulative-cost-ledger.md
  - docs/adr/0006-terminal-pool-lifetime.md
  - docs/adr/README.md
findings:
  critical: 3
  warning: 13
  info: 11
  total: 27
status: issues_found
---

# Phase 01 — Code Review Report (slice C: tests / CI / build / docs)

**Reviewed:** 2026-08-21
**Depth:** deep (test files traced across module boundaries; every load-bearing predicate re-executed in isolation)
**Files Reviewed:** 38
**Status:** issues_found

## Summary

Three named verification properties were re-executed rather than read, and **all three hold**:

| Property | How verified | Result |
|---|---|---|
| `test/load-ts.cjs` resolves `.tsx` | loaded a synthetic `.tsx` through `loadTs` and rendered it with `react-dom/server` | ✅ `<div id="x">hi</div>` — proves `jsx-runtime`, not `React.createElement` |
| `JsxEmit.ReactJSX` and no other constant | `ts.JsxEmit.ReactJSX === 4`, matches `load-ts.cjs:104` | ✅ |
| `electron` from `require.cache` ONLY; injected fake wins | seeded `require.cache[require.resolve('electron')]` from outside the repo, then loaded a module that does `import { app } from 'electron'` | ✅ returned the sentinel; `require.cache[id]` was empty beforehand, so the real loader is never invoked |

Several guards this phase built are genuinely strong and were confirmed by mutation: the FLOOR-12 content-keyed allowlist (`repo-claims.test.cjs:588-619`), the `<div role="button">` accessible-name guard (mutating away the div's own `aria-label` in memory drives it RED — the 43-line open-tag scan is legitimate, not a runaway), `delivery-main.test.cjs:241-271`'s `setInterval` capture, `db-fts.test.cjs`'s positive-control-before-negative discipline, and `engine-parity.test.cjs:288-330`'s byte-level shim drive.

What follows is what does not hold. The three Critical findings are all instances of the exact class this phase exists to remove: **a test that reports green without exercising the thing it names.** One reports a PASS on Windows without running (and thereby falsifies the phase's own `# skipped 4` floor gate), one is a bare symbol grep that a commented-out line satisfies, and one is a documented security control that does not cover the path the product actually uses.

I found no defect in `test/repo-claims.test.cjs`'s newly-added FLOOR-12 clauses 1-4 — the prompt's hypothesis that the accumulator is "the single most likely home for a decorative assertion" is **half right**: one assertion there is mathematically dead (IN-01), and the icon-only rule has demonstrable false negatives (WR-05), but the content-keyed allowlist mechanism itself is sound and mutation-proven.

---

## Critical Issues

### CR-01: A Windows test reports PASS without running, and falsifies the phase's own skip-count gate

**File:** `test/net-binding.test.cjs:319-325`

```js
test('deleting the hook socket no longer opens the gate until the app restarts', async (t) => {
  if (process.platform === 'win32') {
    console.error('[net-binding] socket watchdog case skipped — win32 named pipes have no file to unlink');
    return;                                    // ← node:test records this as `ok`, NOT `# SKIP`
  }
```

**Issue:** A `node:test` callback that returns normally is a **pass**. On `windows-latest` this test contributes `ok N - deleting the hook socket no longer opens the gate until the app restarts` to the TAP stream having asserted nothing at all. It is the one shape the mandate names outright — an assertion that passes because the thing under test never started.

The consequence is not cosmetic. `01-23-SUMMARY.md` § *The exit-code hole, closed locally too* pins the Windows baseline as `# skipped 4` and names all four by title so "they cannot grow unnoticed". This test is **not** one of the four (the four are `hive-hook-node`'s two and `hook-auth-roundtrip.test.cjs:95/:128`). So there are five win32 non-runs and the frozen gate counts four — the fifth is laundered into the `# pass 531` figure that the phase treats as its floor. Every downstream consumer of that number (ROADMAP criterion 2's per-platform counter table, `TESTING.md`'s re-derived `535 / 531 / 0 / 4`) inherits the error.

The sibling in-test branches at `:282-287` and `:311-316` are *not* this defect — that test asserts eight other cases unconditionally, so it cannot go vacuous. This one has no other assertion.

**Fix:**
```js
// The whole test is POSIX-only: a win32 `\\.\pipe\` name has no filesystem entry,
// so there is nothing to unlink and nothing to re-take. Declared as a skip so the
// runner COUNTS it as one — an early `return` is reported as a pass.
test('deleting the hook socket no longer opens the gate until the app restarts',
     { skip: process.platform === 'win32' && 'win32 named pipes have no file to unlink' },
     async (t) => {
  const { send, sent, server, sock } = await hookFloor(t, { watchdogMs: 50 });
  ...
```
Then update the frozen skip set in `01-VALIDATION.md` / the SUMMARY from 4 to 5 and re-derive the `# pass` floor (531 → 530 on win32).

---

### CR-02: The provenance control does not cover the path the product actually updates through

**File:** `.github/workflows/release.yml:143-155, 157-172, 197-222, 239-246` · `README.md:174-180` · `SECURITY.md:114-119` · `RELEASE.md:42-48`

**Issue:** `Generate checksums` hashes only the four installer globs and says so explicitly:

```yaml
# release.yml:147-148
# hash only the distributable artifacts, not blockmaps/yml
files=$(ls *.dmg *.zip *.exe *.AppImage 2>/dev/null || true)
```

`Attest build provenance` attests exactly that merged file (`subject-checksums: release/SHA256SUMS.txt`). But the upload steps ship **more** than that set:

```yaml
# release.yml:169-170 and 244-245
dist/*.blockmap
dist/latest*.yml
```

`latest.yml` / `latest-mac.yml` / `latest-linux.yml` are the **electron-updater feed**. `electron-builder.yml:9-12` stamps `publish: provider: github` into the packaged app and `src/main/updater.ts` polls it; `electron-builder.yml:106-107` states outright that "`latest-mac.yml` points at" the zip Squirrel.Mac updates from. Those manifests carry the sha512 the updater validates the downloaded installer against — and they are **neither checksummed nor attested**.

So the entire auto-update path sits outside the only supply-chain control this project has. An actor who can write release assets (or a compromised dependency inside the `build` job, which inherits workflow-level `contents: write` from `release.yml:12-13` and runs `npm ci` **with** scripts at `:72`) can replace `latest.yml` plus the artifact it names, and every installed copy takes the update. `gh attestation verify` catches this only for a user who manually downloads and runs the command, which is not how updates arrive.

The docs do not scope the claim that way:
- `SECURITY.md:117-119` — *"That is a real supply-chain control … a tampered artifact fails it."*
- `README.md:175-176` — *"Together those prove an artifact was built from this repository."*
- `RELEASE.md:43-44` — *"every artifact named in it can be traced back."*

The last is technically true and quietly the tell: only artifacts **named in** `SHA256SUMS.txt` are covered, and the updater's manifests are not named in it.

**Fix:** include the manifests in the attested subject set, and say what is and is not covered.
```yaml
      - name: Generate checksums
        shell: bash
        run: |
          cd dist
          # Everything that SHIPS is hashed, not just the installers: latest*.yml is
          # the electron-updater feed and is the highest-value tamper target on the
          # page — the updater reads it, no human ever runs `gh attestation verify`
          # against an auto-update.
          files=$(ls *.dmg *.zip *.exe *.AppImage *.blockmap latest*.yml 2>/dev/null || true)
          [ -z "$files" ] && { echo "::error::no artifacts to hash"; exit 1; }
```
and in `SECURITY.md`, replace "a tampered artifact fails it" with the honest scope: *"…fails it **when you run the check by hand**. In-app auto-update validates against `latest*.yml`, which is attested from vN onward; releases before that carry an unattested update feed."*

---

### CR-03: The shim `sock_token` guard is a bare symbol grep a commented-out line satisfies

**File:** `test/hook-auth-roundtrip.test.cjs:163-173, 193-203`

```js
function shimTemplates() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/main/hive.ts'), 'utf8');  // :164 — RAW, never comment-stripped
  ...
}
...
for (const [name, body] of shims) {
  assert.match(body, /sock_token/, `${name} builds a payload without sock_token …`);      // :195-198
  assert.match(body, /HIVE_SOCK_TOKEN/, `${name} does not read HIVE_SOCK_TOKEN …`);       // :199-202
}
```

**Issue:** `body` is a raw slice of a JavaScript template literal — shim source, comments and all. `assert.match(body, /sock_token/)` is satisfied by **any** occurrence of the eight characters: a commented-out assignment, a dead local, a line in the shim's own explanatory header. This is the mandate's named pattern verbatim (*"grep -c symbol >= 1 style assertions that a commented-out or stubbed implementation still satisfies"*), and it is the ONLY pin on five of the six shims — `PROXY_BRIDGE_SHIM` alone has a real byte-level drive at `engine-parity.test.cjs:288-330`, which asserts `lines.length === 1` before parsing and therefore cannot go vacuous.

Concrete failure scenario: a maintainer debugging `GROK_HOOK_SHIM` comments out one line —
```js
const GROK_HOOK_SHIM = `
  ...
  // payload.sock_token = process.env.HIVE_SOCK_TOKEN;   // TODO put back
  ...
`;
```
— `npm test` stays green on all three platforms, and every Grok hook is silently dropped by `authorized()`. That is exactly the outage this file's own header (`:20-26`) says it was written to prevent, and its own comment at `:154-162` records that the previous guard "never once fired" for three of six shims for the whole life of the file. The guard was widened to all six but not strengthened past a substring test.

**Fix:** strip comments before matching, and require the field on an assignment rather than anywhere:
```js
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

for (const [name, body] of shims) {
  const live = stripJs(body);
  assert.match(
    live, /sock_token['"]?\s*[:=]\s*[^,\s}]/,
    `${name} has no live sock_token ASSIGNMENT — a commented-out or dead mention does not send it, `
    + 'and a shim whose payload lacks the field is an engine that goes silently dead-hooked'
  );
  assert.match(live, /process\.env(\.HIVE_SOCK_TOKEN|\[['"]HIVE_SOCK_TOKEN)/, `${name} never reads the env var`);
}
```
Better still: extend the `engine-parity.test.cjs:288-330` pattern (write the generated shim to disk, drive it, assert bytes on the wire) to the remaining five. That is the only assertion shape that cannot be satisfied by source text.

---

## Warnings

### WR-01: The Windows signing gate omits one of the six credentials it names, and the build dies when it fires

**File:** `.github/workflows/release.yml:106` · `electron-builder.yml:127-131`

`release.yml:106` checks five secrets:
```bash
if [ -n "$AZURE_TENANT_ID" ] && [ -n "$AZURE_CLIENT_ID" ] && [ -n "$AZURE_ENDPOINT" ] \
   && [ -n "$AZURE_CODE_SIGNING_ACCOUNT" ] && [ -n "$AZURE_CERT_PROFILE" ]; then
```
`AZURE_CLIENT_SECRET` is absent — yet the same step's own warning at `:111` tells the operator to set it, `release.yml:141` passes it to `electron-builder`, and `electron-builder.yml:131` lists it as required. `electron-builder.yml:127` compounds it: *"only when all five secrets are present"*, immediately above a list of **six**.

Failure scenario: an operator configures five of six. The step turns signing ON, `-c.win.azureSignOptions.*` overrides are injected, and app-builder-lib's Azure manager fails to authenticate — the Windows leg of every release build dies at the packaging step, ~10 minutes in, on a tag push.

**Fix:** add `&& [ -n "$AZURE_CLIENT_SECRET" ]` to the guard (and add `AZURE_CLIENT_SECRET: ${{ secrets.AZURE_CLIENT_SECRET }}` to the step's `env:` block, which currently omits it at `:97-104`), then correct "all five" → "all six" in `electron-builder.yml:127`.

---

### WR-02: A release can publish short an artifact and short its attestation with every check green

**File:** `.github/workflows/release.yml:148-149, 172, 197-202, 238`

Four failure-swallowing settings compose:
```yaml
:148-149   files=$(ls *.dmg *.zip *.exe *.AppImage 2>/dev/null || true)
           [ -z "$files" ] && { echo "no artifacts to hash"; exit 0; }   # ← exit 0
:172       if-no-files-found: warn
:201       cat artifacts/*/SHA256SUMS-*.txt > release/SHA256SUMS.txt 2>/dev/null || true
:238       fail_on_unmatched_files: false
```

If one platform's `Package installers` succeeds but emits a target outside the four globs (an `.msi` after an `electron-builder.yml` `win.target` edit, a `.deb` after a `linux.target` edit), that leg produces no `SHA256SUMS-<os>.txt`, `cat` swallows the miss, the merged file silently covers two platforms instead of three, the attestation covers two, and `softprops/action-gh-release` uploads whatever it found without complaint. Nothing is red. Note also that `> release/SHA256SUMS.txt` creates the file **before** `cat` runs, so a total miss yields an empty attested subject rather than a failure.

**Fix:** assert the merged file is complete before attesting.
```yaml
      - name: Flatten + merge checksums
        run: |
          set -euo pipefail
          mkdir -p release
          find artifacts -type f \( ... \) -exec cp {} release/ \;
          cat artifacts/*/SHA256SUMS-*.txt > release/SHA256SUMS.txt
          legs=$(ls artifacts/*/SHA256SUMS-*.txt | wc -l)
          [ "$legs" -eq 3 ] || { echo "::error::only $legs/3 platform checksum files — the attestation would silently cover a subset"; exit 1; }
          [ -s release/SHA256SUMS.txt ] || { echo "::error::merged checksums are empty"; exit 1; }
```

---

### WR-03: `patch-electron-builder-cycle.cjs` is silent on drift, and its only "loud" backstop is code that has never executed

**File:** `tools/patch-electron-builder-cycle.cjs:36-42, 64-74` · `.github/workflows/ci.yml:30, 88, 127`

The tool's rationale for `exit 0` on a missing anchor is (`:41-42`) *"The failure this guards is also loud on its own: packaging OOMs in the open."* Verified against the actual pipeline, that is not true today:

- `ci.yml:30` (typecheck), `:88` (test ×3) and `:127` (build) **all** install with `npm ci --ignore-scripts`, so `postinstall` never runs and the patch is never applied in CI.
- `ci.yml:148` runs `npm run build` = `electron-vite build`. That never invokes electron-builder, so the OOM path is never reached in CI either.
- The only consumer is `release.yml:72` (`npm ci`, full scripts) → `:119` (`npx electron-builder`), which is gated on `refs/tags/v*`. `01-23-SUMMARY.md` records that **no `v*` tag has been pushed**.

So the "loud" failure lives entirely inside unexecuted code. The tool's warning goes to `postinstall` stdout under `npm ci`, which nobody reads. Net: an `electron-builder` bump can retire this patch and the first person to find out is whoever pushes the next release tag, at which point three platform builds OOM after ~100 s each.

**Measured live at HEAD:** the anchors still match `app-builder-lib@26.15.3` byte-for-byte (`SIGNATURE` ×1, `RECURSE` ×1, both at the exact 4-/12-space indentation the tool expects) — but the patch is **not currently applied in this working tree** (`grep -c "seen = new Set()" node_modules/.../nodeModulesCollector.js` → `0`). Nothing anywhere would tell you that.

**Assessment of the design question:** silent-on-drift is defensible *as a policy* (an upstream fix should not break every contributor's `npm install`), but it is only safe with a detector. There is none. Add one — the same shape as every other guard this phase built:

**Fix:** add to `test/ci-config.test.cjs`, which already runs on three platforms in the `--ignore-scripts` jobs where `app-builder-lib` is present:
```js
test('the electron-builder cycle guard still has an anchor to bind to', () => {
  const target = path.join(root, 'node_modules/app-builder-lib/out/node-module-collector/nodeModulesCollector.js');
  if (!fs.existsSync(target)) return;                       // devDeps absent — nothing to assert
  const src = fs.readFileSync(target, 'utf8');
  const version = JSON.parse(read('node_modules/app-builder-lib/package.json')).version;
  assert.ok(
    src.includes('async _getNodeModules(dependencies, result, seen = new Set()) {')      // already patched
      || src.includes('    async _getNodeModules(dependencies, result) {'),              // patchable
    `app-builder-lib ${version} no longer matches tools/patch-electron-builder-cycle.cjs's anchor. `
    + 'That tool exits 0 with a warning nobody reads, and its only consumer (release.yml, tag-gated) '
    + 'has never run — so without this test the first symptom is three platform builds OOM-ing on a '
    + 'release tag. Either re-derive the patch or delete the file and its postinstall entry.'
  );
});
```

---

### WR-04: `postinstall` chains four tools with `&&`, led by the flakiest one

**File:** `package.json:21`

```json
"postinstall": "electron-rebuild -f && node tools/ensure-pty-perms.cjs && node tools/patch-node-pty-conpty.cjs && node tools/patch-electron-builder-cycle.cjs",
```

`electron-rebuild -f` is the step `CONTRIBUTING.md:77` calls *"the most common setup failure"* and `ci.yml:130-135` wraps in `continue-on-error: true` because it is *"the one historically flaky step"*. When it fails, `&&` short-circuits and **all three** patch tools are skipped — including `patch-node-pty-conpty.cjs`, whose sibling's header (`patch-electron-builder-cycle.cjs:37-39`) describes its absence as *"a Windows build that takes the whole app down at run time — silent and catastrophic."*

**Fix:** run the patches unconditionally; only the rebuild is allowed to be the fragile one.
```json
"postinstall": "electron-rebuild -f; node tools/ensure-pty-perms.cjs && node tools/patch-node-pty-conpty.cjs && node tools/patch-electron-builder-cycle.cjs"
```
(or split into `postinstall` + a `node tools/postinstall.cjs` that sequences them and reports each outcome).

---

### WR-05: The icon-only accessible-name rule exempts every expression-bodied glyph control, and accepts an empty `aria-label` as a name

**File:** `test/repo-claims.test.cjs:758-769`

```js
const glyphOnly = (body) => {
  const text = body.replace(/<[^>]*>/g, '').trim();
  return text.length > 0 || body.includes('<') ? !/[A-Za-z0-9]/.test(text) : false;
};
const named = (openTag, body) => {
  if (/(aria-label|aria-labelledby|title)\s*=/.test(openTag)) return true;
  ...
};
```

Re-executed against the shipped predicate:

| markup | `glyphOnly` | `named` | verdict |
|---|---|---|---|
| `<button onClick={x}>✕</button>` | `true` | `false` | correctly flagged |
| `<button onClick={x}>{closeIcon}</button>` | **`false`** | — | **never checked** |
| `<button onClick={x}>{open ? '▾' : '▸'}</button>` | **`false`** | — | **never checked** |
| `<button onClick={x}></button>` | **`false`** | — | **never checked** |
| `<button aria-label="">✕</button>` | `true` | **`true`** | **scored as named** |
| `<button title={undefined}>✕</button>` | `true` | **`true`** | **scored as named** |
| `<button data-aria-label="x">✕</button>` | `true` | **`true`** | **scored as named** |

The expression-body exemption is the PixelButton `{children}` carve-out (`:750-757`) generalised to *every* JSX expression container — the identifier `closeIcon` supplies the alphanumerics that make the body read as text-bearing. And `aria-label=""` yields **no** accessible name in any browser, so this is precisely the mandate's *"scores a control 'named' both before and after a fix"* shape.

I swept the live tree: **there is no current violation** (37 shallow icon-only controls, 0 unnamed; the 6 expression-bodied candidates all carry real sibling text — `ThreadsPanel.tsx:114-116`, `triggers/ui.tsx:176-179`, etc.). So this is latent, not live — but the phase's ROADMAP criterion 4 evidence reads *"Zero unnamed icon-only controls across 128 `<button>` + 155 `<PixelButton>`"*, which is a completeness claim the predicate does not support.

**Fix:**
```js
// Resolve expression containers down to their string literals so a glyph supplied by
// a ternary or a variable is still classified as a glyph. An identifier inside {} is
// NOT visible text — it is a name we cannot resolve statically, so it must not buy an
// exemption from the accessible-name rule.
const visible = (body) => {
  let t = body.replace(/<[^>]*>/g, ''), prev;
  do { prev = t; t = t.replace(/\{[^{}]*\}/g, (m) =>
    [...m.matchAll(/'([^']*)'|"([^"]*)"/g)].map((x) => x[1] ?? x[2]).join('')); } while (t !== prev);
  return t.trim();
};
const glyphOnly = (body) => !/[A-Za-z0-9]/.test(visible(body));   // empty body counts too

// An EMPTY aria-label is not a name — browsers fall through to the content, which is
// a glyph. Require a non-empty literal or a non-undefined expression.
const NAME = /(?:aria-label|aria-labelledby|title)\s*=\s*(?:"(?!\s*")[^"]+"|'(?!\s*')[^']+'|\{(?!\s*undefined\s*\})[^}]+\})/;
```
Note `glyphOnly` must then explicitly re-exempt `PixelButton.tsx`'s own `<button>` by name (its `{children}` body now resolves to empty), which the pin at `:794-809` already justifies.

---

### WR-06: FLOOR-12 has three blind spots outside `M1` / `M1d` / the six hand-keyed floors

**File:** `test/repo-claims.test.cjs:490 (M1), :681 (M1d), :714-721 (floors)`

The completeness bar is a multiset equality over `M1`, which matches only a **bare integer literal** after `fontSize`. `M1d` covers the decimal/quoted forms. Nothing covers:

1. **Expression-valued sizes.** `<span style={{ fontSize: badgeScale }}>` matches neither regex, and the `floors` array at `:714-721` is a hand-maintained six-entry list keyed by identifier. A *new* expression-valued size is invisible to every FLOOR-12 clause. `01-23-SUMMARY.md` classifies 17 such sites by hand and none of that classification is asserted anywhere.
2. **`font-size:` in CSS.** Clause 1 (`:563`) parses only `--cth-text-*` custom-property declarations from `tokens.css`. `global.css:184-187` carries four literal `font-size:` rules (`.cth-md-preview h1…h4`, currently 24/19/16/**14**px) that no test reads — `h4` sits exactly on the floor and would drop below it unnoticed.
3. **`font-size:` inside a JS string.** `OfficeFloor.tsx:281` and `:1799` build `'…font-size:14px…'` as a style string. Also on the floor, also untested.

**Fix:** extend the negative sweep to cover the shapes the positive bar cannot see, with the same *assert-you-matched-something-first* discipline `M1d` already uses:
```js
test('FLOOR-12 — no sub-14px size hides in CSS or in a style string (#26)', () => {
  const under = [];
  let seen = 0;
  const cssish = /font-size\s*:\s*([0-9.]+)px/g;
  for (const rel of ['src/renderer/src/design/global.css', 'src/renderer/src/design/tokens.css']) {
    for (const m of fs.readFileSync(path.join(root, rel), 'utf8').matchAll(cssish)) {
      seen++; if (Number(m[1]) < 14) under.push(`${rel}: ${m[0]}`);
    }
  }
  for (const [rel, src] of rendererSources()) {
    for (const m of src.matchAll(cssish)) { seen++; if (Number(m[1]) < 14) under.push(`${rel}: ${m[0]}`); }
  }
  assert.ok(seen > 0, 'the CSS-shape scan matched nothing — a broken regex and a clean tree are indistinguishable');
  assert.deepEqual(under, [], `sub-14px sizes M1 cannot see:\n${under.join('\n')}`);
});
```
For (1), pin the M1x *count* alongside the six floors so a new expression-valued site forces a human classification, exactly as `FLOOR12_ALLOWLIST` does for literals.

---

### WR-07: HIVE.md still carries four of the six stale anchors 01-23 reports as corrected

**File:** `HIVE.md:116, :138, :139, :250`

`01-23-SUMMARY.md` § *The bounded doc-claim sweep* records these corrections as applied: *"`hooks.ts` 662→663 … `delivery.ts` 262→604 … (`hive.ts:1338` → `:1375`) → corrected."* Verified against source at HEAD, only `HIVE.md:90-91` and `:295` were actually updated. Four identical anchors remain, and two of them now point at unrelated code:

| HIVE.md | claims | `sed -n '<n>p'` on the named file | verdict |
|---|---|---|---|
| `:116` | cursor advanced by `hive.ts:1338` | `this.revokeProxyToken(agentId);` | **wrong function** (the advance is `hive.ts:1375`) |
| `:138` | *"ADVANCED by drainForStop() (hive.ts:1338)"* | same as above | **wrong function** |
| `:139` | *"which the Stop boundary calls (hooks.ts:662)"* | a comment line; the call is `hooks.ts:663` | off by one |
| `:250` | *"the drain (`hooks.ts:662` → `delivery.ts:262`)"* | `delivery.ts:262` is a `VETO_TTL_MS` comment; `drainAtStop` is at `:604` | **wrong function** |

This is the same defect the sweep was created to close, left in the same document, and reported as done. Nothing tests it — `repo-claims.test.cjs:229-253` pins the twelve HIVE.md *denials* but no anchor.

**Fix:** apply the same substitutions to all occurrences (`sed -i 's/hive\.ts:1338/hive.ts:1375/g; s/hooks\.ts:662/hooks.ts:663/g; s/delivery\.ts:262/delivery.ts:604/g' HIVE.md`) and verify with `grep -noE '(hooks|delivery|index|hive)\.ts:[0-9]+' HIVE.md`. Better: drop the line numbers and name the symbol (`hive.ts drainForStop()`), which is what this phase concluded for its own tests.

---

### WR-08: Three source comments still describe the deleted renderer drain as the live delivery path

**File:** `src/renderer/src/hooks/useHive.ts:752, :873, :908`

`docs/message-queue.md:29-35` and `docs/adr/0001:23-33` were both corrected this phase because they *"named a code path that no longer runs"* — `useHive.ts` effect #4. Effect #4 is indeed gone; `useHive.ts:766` is its tombstone (`// 4) THE QUEUE AND ITS DRAIN ARE MAIN'S NOW (#5 / FLOOR-02). About 150 lines…`).

But three comments in the same file still route live behaviour through it:
- `:752` — *"…cooldown so effect #4 does not type on top of it. (#4's idle gate catches this too…)"*
- `:873` — *"…lands it in Michael's queue exactly as if the user had typed it into the composer — **effect #4 above then drains it to his PTY**."*
- `:908` — *"…enqueue the raw task text here so **effect #4 types it into the REPL** when the agent idles."*

`:873` and `:908` are the load-bearing ones: they tell the next maintainer that Slack ingress and non-Claude enqueues are drained by the renderer. They are not — `delivery.ts:518` is. The ROADMAP criterion is *"grep finds no doc promising a code path that does not run"*; the sweep was scoped to `.md` files and left the identical claim in the source it was correcting the docs about.

**Fix:** repoint all three at main.
```js
//    into the composer — main's drainQueue() (delivery.ts:518) then types it into
//    his PTY on its own tick. (Effect #4 used to do this in the renderer; 01-08
//    deleted it — see the tombstone at :766 and docs/adr/0001.)
```

---

### WR-09: ADR-0005's code anchor points at the wrong function

**File:** `docs/adr/0005-cumulative-cost-ledger.md:52`

> *"The Claude/OTel path (`src/main/index.ts:1524`) appends genuine cumulative snapshots on the ~30s beat."*

`src/main/index.ts:1524` is `const log = hive.logTail(8).map(...)` — part of the god-beat prompt builder, unrelated to the cost ledger. The only `appendCostLedger` call in `index.ts` is at **`:1613`** (`if (sample?.sessionId) hive.appendCostLedger(sample);`). The anchor is off by 89 lines and lands in a different function.

`01-23-SUMMARY.md`'s ADR sweep verified pointers *from source into `docs/adr/`* (`grep -rhoE "adr/[0-9]{4}…" src/`). It never verified pointers in the other direction, which is where the rot is.

**Fix:** `src/main/index.ts:1613`, or drop the number: *"the Claude/OTel path (`src/main/index.ts`, the `usage` branch of the ~30s beat)"*.

---

### WR-10: The new lint gate is invisible to contributors, and nothing pins the doc half

**File:** `README.md:213-221` · `CONTRIBUTING.md:82-92` · `.github/workflows/ci.yml:33-48` · `test/ci-config.test.cjs:314-342`

Plan 01-21 made `npm run lint` a hard CI gate. `ci.yml:34-37` justifies writing it as an npm script so *"the command is byte-identical to the one a contributor runs locally — one gate, one definition."* But:

- `README.md:213-221` ("Other scripts") lists `build`, `typecheck`, `test`, `test:focused`, `dist`. **No `lint`.**
- `README.md:218` says `npm test` *"is what CI gates on"* — no longer true.
- `CONTRIBUTING.md:82-92` ("Before you open a PR") lists typecheck and tests. **No lint.**

A contributor following the documented routine will push and fail CI on a step no document mentions. Note the asymmetry: `ci-config.test.cjs:194-198` deliberately cross-pins the `continue-on-error` promise to CONTRIBUTING.md's exact sentence so *"whichever one drifts, this test fails on the PR that drifts it"* — the lint gate got the workflow half of that treatment (`:314-342`) and none of the doc half.

**Fix:** add `npm run lint  # eslint . --max-warnings 0 — a hard CI gate` to README's script list, add it as step 3 in CONTRIBUTING's pre-PR list, and extend `ci-config.test.cjs:344-376` with the same cross-pin the `continue-on-error` clause uses:
```js
  assert.ok(
    read('CONTRIBUTING.md').includes('npm run lint'),
    'CONTRIBUTING.md does not tell a contributor to run the lint gate. ci.yml gates on it, so an '
    + 'undocumented gate is a PR that fails on a command the docs never named.'
  );
```

---

### WR-11: The "still rejected" security assertion ignores the shim's exit code and races a fixed 300 ms sleep

**File:** `test/hook-auth-roundtrip.test.cjs:128-152`

```js
  await runShim(command, env, JSON.stringify({ ... }));      // :143 — result DISCARDED
  await new Promise((r) => setTimeout(r, 300));              // :146
  assert.equal(server.transcriptPath('a1'), undefined, 'an unauthenticated payload was accepted …');
```

Two problems, both in the unsafe direction for a negative security assertion:

1. **Nothing proves the shim ran.** `runShim` returns `{ code, stderr }` and the sibling positive test asserts `res.code === 0` at `:118`; this one throws it away. The file's own header (`:60-61`) diagnoses exactly this — *"the second test's assertion is that NOTHING was accepted, so a shim that never started satisfied it vacuously"* — and the fix applied (stdin instead of a dash-hostile here-string) addressed the *cause* of one instance, not the *vacuity*. The blast radius is bounded only because the sibling shares the launch path.
2. **A fixed 300 ms window.** If a slow runner accepts the payload at t = 350 ms, the assertion has already read `undefined` and passed. A security check whose answer depends on a sleep is a coin flip on a loaded CI box.

**Fix:**
```js
  const res = await runShim(command, env, JSON.stringify({ ... }));
  assert.equal(res.code, 0, `the shim never ran (${res.stderr}) — this assertion would pass vacuously`);
  // Poll past the point the ACCEPTED case lands, so "not yet" cannot read as "rejected".
  for (let i = 0; i < 40 && server.transcriptPath('a1') === undefined; i++) {
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.equal(server.transcriptPath('a1'), undefined, 'an unauthenticated payload was accepted …');
```

---

### WR-12: The "hard gate" test never pins the test job's command, while the lint test pins its own exactly

**File:** `test/ci-config.test.cjs:161-199` vs `:314-334`

The lint test binds the command byte-for-byte:
```js
const lint = steps.filter((s) => String(s.run || '').trim() === 'npm run lint');    // :317
assert.equal(lint.length, 1, ...);
```
so `npm run lint || true` drives it RED. The three-platform gate test asserts only the matrix OS list, job-level and step-level `continue-on-error`, and CONTRIBUTING.md's sentence. It never asserts that `npm test` is invoked at all, let alone unwrapped.

Concrete: change `ci.yml:115` to `run: npm test || echo "flaky, see #NNN"` and **every assertion in `ci-config.test.cjs` still passes**, while all three "hard gate" rows go permanently green. That is the same class of disarming the `continue-on-error` counter exists to catch, through a door the counter cannot see — and it is on the more important of the two gates.

**Fix:**
```js
  const runs = job.steps.filter((s) => /\bnpm\s+test\b/.test(String(s.run || '')));
  assert.equal(runs.length, 1, 'the CI test job must run exactly one `npm test` step');
  assert.equal(
    String(runs[0].run).trim(), 'npm test',
    `the test step is \`${String(runs[0].run).trim()}\`. It must be bare: a \`|| true\`, a \`; exit 0\` `
    + 'or a pipe swallows the runner exit code, and CONTRIBUTING.md promises this is a hard gate. '
    + 'continue-on-error is not the only way to disarm one.'
  );
```

---

### WR-13: `stripComments` truncates strings containing `//`, leaving unbalanced quotes in the source every FLOOR-12 scan reads

**File:** `test/repo-claims.test.cjs:63`

```js
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
```

`//.*$` has no string awareness. Measured across `src/renderer/src`: **10 lines** carry a URL inside a string literal and are truncated; **1 of them is left with an odd quote count.** The live instance:

```tsx
// src/renderer/src/components/MessageQueueComposer.tsx:691
                    href="https://console.groq.com/keys"
// after stripComments:
                    href="https:
```

The `jsxElements` scanner at `:875-907` is quote-aware by design (`:887-891`). Fed a source with an unterminated `"`, its quote mode runs to the next `"` anywhere in the file, swallowing the `>` that ends whatever tag it was scanning. The failure direction is silent: a control caught in that window gets a multi-hundred-character `body` full of identifiers, `glyphOnly` reads it as text-bearing, and it is **exempted** from the accessible-name rule.

No control is currently mis-scanned (I checked every `<button>`, `<PixelButton>` and `<div>` in the tree — the only long open-tag is `FullscreenTerminal.tsx`'s legitimate 43-line handler block, which contains exactly one `aria-label`, its own, and correctly goes RED under mutation). But the hazard is one refactor away, and the same strip is used by every clause in the file.

**Fix:** make the line-comment strip string-aware enough for this repo's shapes, or exclude the common false positive:
```js
// `//` inside a string is not a comment. A naive strip turns `href="https://x"` into
// `href="https:` and leaves an unterminated quote in the source jsxElements() scans.
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1|\/\/.*$/gm, (m, q) => (q ? m : ''));
```
(the alternation consumes complete string literals first, so `//` inside one is never seen as a comment start).

---

## Info

### IN-01: A FLOOR-12 assertion that cannot fail
**File:** `test/repo-claims.test.cjs:614-618`
The total-count check runs *after* an assertion that the two multisets are exactly equal in both directions (`:599-612`). Equal multisets have equal sums, so this can never fail independently — a decorative assertion in the phase's flagship anti-decoration file. **Fix:** delete it, or move it *above* the multiset compare where it is a cheap fast-fail with a legible message.

### IN-02: A test whose title is broader than what it checks
**File:** `test/repo-claims.test.cjs:338-352`
*"the keyword store is not described as an 'Enterprise Knowledge Graph'"* checks `README.md` and `src/preload/index.ts` only. Seven live sites remain: `src/main/config.ts:159/:275/:493`, `src/main/hive.ts:1455`, `src/renderer/src/store/config.ts:74/:142`, and `resources/skills/capabilities/SKILL.md:96` — the last is shipped into every agent's skills directory, so the retired name is presented to the agents themselves. `deferred-items.md` § 5 owns them. **Fix:** rename the test to name its scope (`…in README.md and the preload surface (#31)`) so the title stops reading as a repo-wide guarantee.

### IN-03: A live failure message that tells the fixer to undo a deliberate fix
**File:** `test/ci-config.test.cjs:249-255`
The `main.log` assertion's message says the field *"must name main.log **and the platform paths to it**"* and *"Until FLOOR-05 ships the Settings button, the by-hand path is the ONLY way."* FLOOR-05 shipped, and `bug_report.yml:28-33` records that the paths were removed **because** of it. Whoever hits this failure is instructed to restore what plan 01-10 deliberately deleted. **Fix:** rewrite the message around the Settings route the assertion at `:242-248` actually enforces.

### IN-04: A required pre-flight checkbox that says it does not apply to you
**File:** `.github/ISSUE_TEMPLATE/bug_report.yml:86-87`
`required: true` on a label ending *"(n/a for a downloaded release build)"*. A release-build reporter must still tick a box that disclaims itself. The rewording made the statement vacuously true rather than making the field conditional — better than the original, still a required-field friction point on the primary install path. **Fix:** drop `required: true` on that one option; the second (`I searched existing issues`) carries the pre-flight bar.

### IN-05: The poisoned-assert probe covers one of three assertion idioms
**File:** `test/repo-claims.test.cjs:148-152`
`POISON` intercepts `'assert'` and `'node:assert'`. A harness on `require('node:assert/strict')` is **not** poisoned, runs normally, exits 0, and is reported as *"cannot fail"* — a false positive whose obvious "fix" is to add it to the poison list. A harness that asserts via `process.exitCode = 1` with no `assert` at all is indistinguishable from a genuinely silent one. Currently all 8 harnesses use plain `assert`, so neither fires. **Fix:** add `'assert/strict'` and `'node:assert/strict'` to the intercept set, and note the `process.exitCode` limitation in the comment.

### IN-06: Suite-size floors set an order of magnitude below reality
**File:** `test/ci-config.test.cjs:76` (`testFiles.length > 30`, actual 60) · `test/repo-claims.test.cjs:98` (`files.length > 50`, actual ~130)
Both are "is the tree still there" sanity checks that tolerate losing half the tree. **Fix:** raise to a real floor derived from the current count minus a small margin, or assert against a pinned number the way `STALE_STOP_DRAIN_DENIALS.length === 12` (`:232-237`) does.

### IN-07: Two silent-degradation modes inside the electron-builder patch itself
**File:** `tools/patch-electron-builder-cycle.cjs:76-84`
(a) `String.replace` with a **string** pattern replaces only the first occurrence. There is exactly one today, but a future app-builder-lib shipping two collectors would leave one unguarded while the success line at `:87` still prints. (b) `seen` is keyed on **object identity** of `d`; if a future hoister builds a fresh node per edge, `seen.has(d)` never hits and the OOM returns — again with a success message. The surrounding code already computes a stable key (`${d.name}@${reference}`). **Fix:** `split().join()` or a global regex for (a); key `seen` on `` `${d.name}@${[...d.references][0]}` `` for (b).

### IN-08: ADR-0001's amendment blockquote loses its marker mid-paragraph
**File:** `docs/adr/0001-one-gate-for-pty-writes.md:33-36`
Line 33 ends `…only when the agent is` inside a `>` block; lines 34-36 continue the sentence with no `>` prefix. It renders correctly only via CommonMark lazy continuation and breaks the moment anyone inserts a blank line. It also folds the *current* drain contract into a note headed "Amended 2026-08-21", which reads as history. **Fix:** prefix lines 34-36 with `>`, or move the five-condition contract out of the amendment and into the Decision body where it belongs.

### IN-09: The lint gate's real scope is `src/**` with two rules; nothing states that
**File:** `eslint.config.js:57-71` · `.github/workflows/ci.yml:33, 47`
The only entry carrying `rules` and `linterOptions` is `files: ['src/**/*.{ts,tsx}']`. `eslint .` therefore reports **zero findings** over `test/` (60 files), `tools/`, `e2e/`, `scripts/` and the config files themselves — including `reportUnusedDisableDirectives`, so an inert `eslint-disable` in `test/` is exactly as invisible as the 13 in `src/` used to be. ci.yml:47 calls it *"A hard gate"* without qualification. This is a deliberate bounded surface (`eslint.config.js:11-19` argues it well) — the gap is that the scope is nowhere stated for a reader of the workflow. I verified the guard against widening holds: adding `src/**` to `ignores` makes `calculateConfigForFile` return `undefined` and `ci-config.test.cjs:400-429` errors out RED. **Fix:** one line in `ci.yml:47`'s comment naming the scope.

### IN-10: Inverted-polarity assertions that go red when security improves
**File:** `test/hive-durability.test.cjs:326-332`
`assert.ok(history.includes(MISSED_SECRET), …)` and `assert.match(history, /"token": "abcdef123456789"/)` pin a *gap* in `redactSecrets` as expected behaviour, so widening the pattern battery turns CI red. `:310-317` argues the case (one shared matcher under a LOCKSTEP contract with `voice-messages.test.cjs`) and `:334-339` adds a real anti-vacuity control, which is more care than most such tests get. The residual risk is incentive, not correctness: under CI pressure the cheap move is to narrow the improvement back. **Fix:** none required; consider `// eslint-disable`-style tagging or a `CEILING:` prefix in the test name so the polarity is visible in the TAP output.

### IN-11: Doc line anchors with no test, in the two documents this phase corrected
**File:** `docs/message-queue.md:26` · `docs/adr/0001-one-gate-for-pty-writes.md:20`
Both hardcode `src/main/delivery.ts:518`. Both are **correct today** (verified: `drainQueue` is at `:518`). But this is the anchor form that has already rotted twice in `HIVE.md` (see WR-07) and once in `docs/adr/0005` (WR-09), and `repo-claims.test.cjs` deliberately refuses line keys for its own assertions (`:493`, `:818-820`) for exactly this reason. **Fix:** apply the file's own doctrine to the docs — name the symbol, not the line — or add a `test/repo-claims.test.cjs` clause that extracts every `<file>.ts:<n>` anchor from the tracked docs and asserts the named symbol appears within ±3 lines.

---

_Reviewed: 2026-08-21_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep — `test/load-ts.cjs`'s three contracted properties, the `glyphOnly`/`named` predicates, the `<div role="button">` guard and the electron-builder patch anchors were each re-executed in isolation against the live tree rather than read. No repository file was modified; `git status --porcelain` is clean._
