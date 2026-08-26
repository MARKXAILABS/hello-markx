'use strict';

/**
 * GATE-02, half one: the PURE allowlist filter (`allowFromEnv` in shellEnv.ts).
 *
 * Every agent on this floor runs with tool permissions bypassed by design, so
 * every variable that crosses from the operator's `process.env` into an agent's
 * child env is readable by a prompt-injected model. This file asserts the filter
 * in BOTH directions — what it drops AND what it keeps — because a test that
 * only asserts absence passes vacuously against a filter that returns `{}` and
 * kills every agent with ENOENT (D-33 / D-40).
 *
 * CEILING OF THIS FILE: it proves the function's arithmetic, nothing else. That
 * the PTY actually calls it is `test/pty-spawn-env.test.cjs`; that the OS hands
 * the resulting object to a real child is the live transcript in the SUMMARY.
 *
 * `shellEnv.ts` imports only `node:fs` and `node:child_process`, so it loads with
 * no electron stub and no PTY — asserted below, because the moment it grows an
 * `electron` import it stops being testable on a CI runner that installed with
 * `npm ci --ignore-scripts`.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { allowFromEnv, ENV_ALLOW, ENV_ALLOW_PREFIX } = loadTs('src/main/shellEnv.ts');

const SHELL_ENV_SRC = path.resolve(__dirname, '..', 'src/main/shellEnv.ts');

test('the gate, both directions on ONE call: infrastructure through, credentials dropped', () => {
  const out = allowFromEnv({
    PATH: '/usr/bin:/bin',
    HTTPS_PROXY: 'http://proxy.corp:8080',
    NODE_EXTRA_CA_CERTS: '/etc/ssl/corp.pem',
    AWS_SECRET_ACCESS_KEY: 'AKIAsecret',
    GH_TOKEN: 'ghp_secret',
    ANTHROPIC_API_KEY: 'sk-ant-secret'
  }, []);

  // Positives FIRST — without them this whole file passes against `() => ({})`.
  assert.equal(out.PATH, '/usr/bin:/bin');
  // The corporate-operator case, asserted rather than assumed: `memory.ts` filters
  // with an EMPTY pass-through list, so if these two are not in ENV_ALLOW there is
  // no configuration anywhere that could re-admit them for MemPalace.
  assert.equal(out.HTTPS_PROXY, 'http://proxy.corp:8080');
  assert.equal(out.NODE_EXTRA_CA_CERTS, '/etc/ssl/corp.pem');

  assert.equal('AWS_SECRET_ACCESS_KEY' in out, false);
  assert.equal('GH_TOKEN' in out, false);
  assert.equal('ANTHROPIC_API_KEY' in out, false);
});

test('exact names: PATH and HOME survive, an AWS secret does not', () => {
  const out = allowFromEnv({ PATH: '/usr/bin', AWS_SECRET_ACCESS_KEY: 'x', HOME: '/h' }, []);
  assert.deepEqual(Object.keys(out).sort(), ['HOME', 'PATH']);
  assert.equal(out.HOME, '/h');
});

test('L-13: a win32 `Path` spelling survives, under its ORIGINAL casing', () => {
  // process.env on Windows is case-insensitive to the OS, but the object's keys
  // are whatever the OS gave them. A `Set.has('PATH')` against a machine that
  // reports `Path` strips PATH and every agent dies with ENOENT. Both sides of
  // the comparison are upper-cased; the EMITTED key is never rewritten, because
  // the child is handed what the OS gave us.
  const out = allowFromEnv({ Path: 'C:\\Windows' }, []);
  assert.equal(out.Path, 'C:\\Windows');
  assert.equal('PATH' in out, false, 'the key is passed through, not normalised');

  // The same rule going the other way: a lowercase proxy spelling (what most
  // POSIX tooling actually reads) survives as-is.
  const proxy = allowFromEnv({ http_proxy: 'http://p:1' }, []);
  assert.equal(proxy.http_proxy, 'http://p:1');
});

test('prefix families: LC_* (locale) and HIVE_* (our own names) both pass', () => {
  const out = allowFromEnv({ LC_TIME: 'x', HIVE_ROOT: '/h', GOOGLE_API_KEY: 'k' }, []);
  assert.equal(out.LC_TIME, 'x');
  assert.equal(out.HIVE_ROOT, '/h');
  assert.equal('GOOGLE_API_KEY' in out, false);
  assert.deepEqual([...ENV_ALLOW_PREFIX], ['LC_', 'HIVE_']);
});

test('the operator escape hatch admits a name, and only when listed', () => {
  assert.equal(allowFromEnv({ MY_CUSTOM_KEY: 'x' }, ['MY_CUSTOM_KEY']).MY_CUSTOM_KEY, 'x');
  assert.equal('MY_CUSTOM_KEY' in allowFromEnv({ MY_CUSTOM_KEY: 'x' }, []), false);
  // Case-insensitive on the operator's side too — they type it by hand.
  assert.equal(allowFromEnv({ MY_CUSTOM_KEY: 'x' }, ['my_custom_key']).MY_CUSTOM_KEY, 'x');
});

test('T-04-ENV-04: a malformed pass-through list degrades to [], it never throws', () => {
  const env = { PATH: '/usr/bin', GH_TOKEN: 'ghp_secret' };
  for (const bad of ['not-an-array', [1, null], null, undefined, 42, { 0: 'GH_TOKEN' }]) {
    const out = allowFromEnv(env, bad);
    assert.equal(out.PATH, '/usr/bin', `PATH still survives for ${JSON.stringify(bad)}`);
    assert.equal('GH_TOKEN' in out, false, `no extra name admitted for ${JSON.stringify(bad)}`);
  }
  // A well-formed list with ONE junk member still honours the good member.
  const mixed = allowFromEnv(env, [null, 'GH_TOKEN', 7]);
  assert.equal(mixed.GH_TOKEN, 'ghp_secret');
});

test('an empty env returns an empty object and throws nothing', () => {
  const out = allowFromEnv({}, []);
  assert.equal(Object.keys(out).length, 0);
  // An undefined value in process.env (Node models a missing var that way) is
  // dropped rather than emitted as the string "undefined".
  assert.equal('HOME' in allowFromEnv({ HOME: undefined }, []), false);
});

test('ENV_ALLOW stores upper-cased names, so the comparison can never be one-sided', () => {
  for (const name of ENV_ALLOW) {
    assert.equal(name, name.toUpperCase(), `${name} is stored upper-cased`);
  }
  assert.equal(ENV_ALLOW.has('PATH'), true);
  assert.equal(ENV_ALLOW.has('HTTPS_PROXY'), true);
  assert.equal(ENV_ALLOW.has('NODE_EXTRA_CA_CERTS'), true);
  assert.equal(ENV_ALLOW.has('AWS_SECRET_ACCESS_KEY'), false);
});

test('D-34: the ceiling ships beside the filter, items (a)-(i), four ACCEPTED with an owner', () => {
  const src = fs.readFileSync(SHELL_ENV_SRC, 'utf8');
  const items = src.match(/^\s*\*\s+\([a-i]\)/gm) ?? [];
  assert.ok(items.length >= 9, `ceiling has ${items.length} items, expected >= 9`);
  const owners = src.match(/owner:/gi) ?? [];
  assert.ok(owners.length >= 4, `ceiling names ${owners.length} owners, expected >= 4`);
  assert.match(src, /config\.json/, 'item (g) names the file the operator list lives in');
  assert.equal(/from 'electron'/.test(src), false, 'shellEnv.ts stays electron-free');
});
