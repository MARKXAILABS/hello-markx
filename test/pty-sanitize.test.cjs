'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

// useHive.ts is a React hook: it imports `react` and the renderer's `@/` alias,
// neither of which resolves under node:test. `sanitizePtyText` is a pure
// function, so stub those two out and load the real module — the guard is
// asserted where it actually ships, not against a copy.
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request.startsWith('@/') || request === 'react') {
    return new Proxy(function () {}, { get: () => function () {} });
  }
  return origLoad.call(this, request, ...rest);
};
const { sanitizePtyText } = require('./load-ts.cjs')('src/renderer/src/hooks/useHive.ts');
Module._load = origLoad;

// How submitToPty wraps a multi-line body once it is clean.
const wrap = (clean) => `\x1b[200~${clean}\x1b[201~`;

test('a body carrying a literal paste-end sequence cannot break out of the paste', () => {
  // The exploit: close the paste, then type a command and press Enter. Every
  // byte after ESC[201~ would otherwise arrive as keystrokes.
  const attack = 'here is the work order\n\x1b[201~rm -rf ~/hive\r';
  const clean = sanitizePtyText(attack);

  assert.equal(clean.includes('\x1b[201~'), false, 'paste terminator survived');
  assert.equal(clean.includes('\x1b[200~'), false, 'paste opener survived');
  assert.equal(clean.includes('\x1b'), false, 'a bare ESC survived');

  const payload = wrap(clean);
  assert.equal(payload.split('\x1b[201~').length - 1, 1, 'more than one paste terminator in the payload');
  assert.ok(payload.endsWith('\x1b[201~'), 'the fence must close at the very end');
  // The text is kept — only its ability to escape is removed.
  assert.ok(clean.includes('rm -rf ~/hive'));
});

test('a body cannot submit itself', () => {
  // \r is the submit keystroke; submitToPty sends it separately, deliberately.
  assert.equal(sanitizePtyText('approve this\rand this\r'), 'approve thisand this');
  assert.equal(sanitizePtyText('windows mail\r\nsecond line'), 'windows mail\nsecond line');
});

test('other C0 controls and DEL are stripped', () => {
  assert.equal(sanitizePtyText('a\x00b\x07c\x1bd\x7fe'), 'abcde');
});

test('ordinary multi-line text with tabs survives byte-for-byte', () => {
  const mail = [
    'WORK ORDER FROM HIVE',
    'Subject: ship the parser',
    '',
    'Steps:',
    '\t1. read src/main/hive.ts',
    '\t2. run `npm test` — 100% of it',
    '',
    'Unicode is not a control character: café — ✅ ⛔ 你好'
  ].join('\n');
  assert.equal(sanitizePtyText(mail), mail);
});
