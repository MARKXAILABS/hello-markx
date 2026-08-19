'use strict';

/**
 * Knowledge-store dedupe + reindex (#31) and date-aware condensation (#32).
 *
 * The three things that were silently wrong:
 *   - re-ingesting an artifact minted a fresh docId every time, so the same file
 *     dropped in twice was indexed twice and outranked everything else;
 *   - there was no way to rebuild an index that had already duplicated;
 *   - condensation took FILE order as chronological order, so a memory.md whose
 *     sections were not strictly appended got its NEWEST work summarized away.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const kg = require('../src/main/kg-core.cjs');
const { orderRecent, headingDate, parseMemory } = loadTs('src/main/reflect.ts');
const { MemoryManager } = loadTs('src/main/memory.ts');

const tmpRoot = (t) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-dedupe-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return d;
};

/** Every chunk line currently in the index, whatever document it belongs to. */
const indexLines = (root) => {
  const p = path.join(root, 'index.jsonl');
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.trim());
};

// ─── #31: content-hash dedupe ────────────────────────────────────────────────

test('ingesting the same file twice yields ONE document, not two', (t) => {
  const root = tmpRoot(t);
  const src = path.join(root, 'refund-policy.md');
  fs.writeFileSync(src, '# Refund Policy\n\nFull refund within 30 days of purchase.\n', 'utf8');

  const first = kg.ingest(root, { srcPath: src, tags: ['policy'] });
  const linesAfterFirst = indexLines(root).length;
  const second = kg.ingest(root, { srcPath: src, tags: ['policy'] });

  assert.equal(second.duplicate, true, 'the second ingest must report itself a duplicate');
  assert.equal(first.duplicate, false, 'the first was not');
  assert.equal(second.docId, first.docId, 'and must hand back the EXISTING document');
  assert.equal(kg.list(root).length, 1, 'one document in the corpus');
  assert.equal(kg.stats(root).docCount, 1);
  assert.equal(indexLines(root).length, linesAfterFirst, 'no extra chunk lines appended');

  // The point of all this: one hit, not the same passage twice.
  const hits = kg.search(root, 'refund within 30 days');
  assert.equal(hits.length, 1, 'a duplicate ingest must not double the search results');
  assert.equal(hits[0].docId, first.docId);
});

test('inline text dedupes on content too', (t) => {
  const root = tmpRoot(t);
  const a = kg.ingest(root, { text: 'The office wifi password rotates monthly.', title: 'Wifi' });
  const b = kg.ingest(root, { text: 'The office wifi password rotates monthly.', title: 'Wifi' });
  assert.equal(b.docId, a.docId);
  assert.equal(kg.list(root).length, 1);
});

test('same bytes, NEW metadata is a different searchable document', (t) => {
  const root = tmpRoot(t);
  const img = path.join(root, 'org-chart.png');
  fs.writeFileSync(img, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const a = kg.ingest(root, { srcPath: img, title: 'Org Chart', caption: 'Engineering reports to the CTO.' });
  // An image is indexed by its metadata alone (no OCR), so a new caption is
  // genuinely new searchable content — deduping it away would lose it.
  const b = kg.ingest(root, { srcPath: img, title: 'Org Chart', caption: 'Sales reports to the CRO.' });
  assert.equal(b.duplicate, false);
  assert.notEqual(b.docId, a.docId);
  assert.equal(kg.list(root).length, 2);

  // ...and the same caption a third time is once again a duplicate.
  assert.equal(kg.ingest(root, { srcPath: img, title: 'Org Chart', caption: 'Sales reports to the CRO.' }).docId, b.docId);
});

test('two different files that share a prefix are NOT confused for each other', (t) => {
  const root = tmpRoot(t);
  // Longer than the fingerprint's 1 MB read window, so this also proves the
  // streamed hash concatenates its windows instead of stopping at the first.
  const head = 'x'.repeat(1536 * 1024);
  const one = path.join(root, 'one.md');
  const two = path.join(root, 'two.md');
  fs.writeFileSync(one, head + '\nalpha ending\n', 'utf8');
  fs.writeFileSync(two, head + '\nomega ending\n', 'utf8');

  const a = kg.ingest(root, { srcPath: one });
  const b = kg.ingest(root, { srcPath: two });
  assert.equal(b.duplicate, false, 'a shared prefix must not fingerprint as the same content');
  assert.notEqual(b.docId, a.docId);
  assert.equal(kg.list(root).length, 2);
});

// ─── #31: reindex ────────────────────────────────────────────────────────────

test('reindex rebuilds the index from scratch, dropping duplicate and stale lines', (t) => {
  const root = tmpRoot(t);
  const a = kg.ingest(root, { text: 'Alpha document about onboarding new hires.', title: 'Onboarding' });
  kg.ingest(root, { text: 'Beta document about the deployment runbook.', title: 'Runbook' });
  const healthy = indexLines(root).length;

  // Simulate the damage the old no-dedupe ingest did: the same chunks appended a
  // second time, plus a line for a document that no longer exists on disk.
  const idx = path.join(root, 'index.jsonl');
  fs.appendFileSync(idx, fs.readFileSync(idx, 'utf8'), 'utf8');
  fs.appendFileSync(idx, JSON.stringify({ docId: 'ghost', title: 'Ghost', source: 'ghost', modality: 'text', chunkIdx: 0, text: 'onboarding ghost' }) + '\n', 'utf8');
  assert.ok(kg.search(root, 'onboarding').length > 1, 'precondition: the index is duplicated');

  const res = kg.reindex(root);
  assert.equal(res.docCount, 2);
  assert.equal(indexLines(root).length, healthy, 'index restored to exactly one line per stored chunk');
  assert.equal(res.chunkCount, healthy);
  assert.equal(kg.search(root, 'onboarding').length, 1, 'one hit again');
  assert.equal(kg.search(root, 'ghost').length, 0, 'the orphaned document is gone');
  assert.ok(kg.search(root, 'deployment runbook').some((h) => h.docId !== a.docId), 'the other document survived');
  assert.equal(kg.stats(root).chunkCount, healthy, 'stats agrees with the index it describes');
});

test('reindex on an empty store is a no-op, not a crash', (t) => {
  const root = tmpRoot(t);
  assert.deepEqual(kg.reindex(root), { docCount: 0, chunkCount: 0 });
});

// ─── #31: scoring stayed identical while getting cheaper ─────────────────────

test('scoreChunk still counts whole words only, and ignores near-misses', () => {
  const terms = kg.tokenize('refund 30');
  // "130" tokenizes to one token, so the term "30" is NOT in this chunk — the
  // substring fast-reject must not turn that into a match.
  assert.equal(kg.scoreChunk({ title: 'x', text: 'invoice 130 issued' }, ['30'], '30'), 0);
  // tokenize() splits on `_`, so a word-boundary assertion would be wrong here.
  assert.ok(kg.scoreChunk({ title: 'x', text: 'see refund_policy.md' }, ['refund'], 'refund') > 0);
  // Repeats score higher than a single mention (the term-frequency half).
  const once = kg.scoreChunk({ title: 'x', text: 'refund in 30 days' }, terms, 'refund');
  const twice = kg.scoreChunk({ title: 'x', text: 'refund refund in 30 days' }, terms, 'refund');
  assert.ok(twice > once, 'term frequency still counts');
});

// ─── #32: date-aware condensation ────────────────────────────────────────────

test('headingDate reads an ISO date and refuses anything that only looks like one', () => {
  assert.equal(headingDate('## 2026-06-01 standup'), '2026-06-01');
  assert.equal(headingDate('## Session on 2026-06-01T09:30 — deploy'), '2026-06-01T09:30');
  assert.equal(headingDate('## 2026-06-01-standup'), '2026-06-01', 'a hyphen-joined heading still dates');
  assert.equal(headingDate('## release 1234-56-78'), null, 'month 56 is not a month');
  assert.equal(headingDate('## build 2026-06-011'), null, 'a longer number is not a date');
  assert.equal(headingDate('## a plain heading'), null);
});

test('condensation keeps the NEWEST sections when the file is out of order', () => {
  // The exact failure: a file where the newest entry is not last. `slice(-K)`
  // over file order would keep "01" and summarize away "09".
  const memory = [
    '# Memory — dev1',
    '',
    '## 📌 Durable facts (pinned — never condensed)',
    '- repo lives at /srv/app',
    '',
    '## 🗜 Condensed history',
    'Earlier: shipped v1.',
    '',
    '## Recent',
    '',
    '## 2026-06-09 the newest work',
    'fixed the deploy',
    '',
    '## 2026-06-03 middle',
    'a middling day',
    '',
    '## 2026-06-01 the oldest work',
    'talked about nothing',
    ''
  ].join('\n');

  const ordered = orderRecent(parseMemory(memory).recent);
  assert.deepEqual(
    ordered.map((s) => s.heading),
    ['## 2026-06-01 the oldest work', '## 2026-06-03 middle', '## 2026-06-09 the newest work'],
    'oldest → newest, whatever order the file was in'
  );
  // What condense() then does: keep the newest 1, evict the rest.
  assert.deepEqual(ordered.slice(-1).map((s) => s.heading), ['## 2026-06-09 the newest work']);
});

test('an undated section stays with the dated entry above it', () => {
  const sections = [
    { heading: '## 2026-06-09 newest', body: 'b' },
    { heading: '## follow-up notes', body: 'b' },   // belongs to 06-09
    { heading: '## 2026-06-01 oldest', body: 'b' }
  ];
  assert.deepEqual(
    orderRecent(sections).map((s) => s.heading),
    ['## 2026-06-01 oldest', '## 2026-06-09 newest', '## follow-up notes']
  );
});

// ─── #32: the palace sharing model ───────────────────────────────────────────

const manager = (scope) => new MemoryManager(() => '/hive/home', () => ({ enabled: true, model: 'minilm', scope }));

test("'shared' is the default and resolves the same palace it always did", () => {
  for (const settings of [undefined, 'shared']) {
    const m = manager(settings);
    assert.equal(m.scope(), 'shared');
    // Same path for everyone, and the same path an install already has on disk.
    assert.equal(m.palacePath(), path.join('/hive/home', 'palace'));
    assert.equal(m.palacePath('pam-m3k9x'), m.palacePath('jim-m3k9y'));
  }
});

test("'agent' scope gives each agent its own palace, and none without an id", () => {
  const m = manager('agent');
  assert.equal(m.scope(), 'agent');
  assert.equal(m.palacePath('pam-m3k9x'), path.join('/hive/home', 'palaces', 'pam-m3k9x'));
  assert.notEqual(m.palacePath('pam-m3k9x'), m.palacePath('jim-m3k9y'));
  // No id named → no palace. Falling back to the shared one here would hand an
  // unidentified caller everybody's memories, which is the whole thing to avoid.
  assert.equal(m.palacePath(), null);
  assert.equal(m.palacePath('   '), null);
});

test('an agent id can never escape the palaces directory, and never collides', () => {
  const m = manager('agent');
  const root = path.join('/hive/home', 'palaces');
  for (const hostile of ['../../etc', '..', '.', 'a/../../b', 'a\\b', '.hidden']) {
    const p = m.palacePath(hostile);
    assert.equal(path.dirname(p), root, `${hostile} must stay directly under palaces/`);
    assert.ok(!path.relative(root, p).startsWith('..'), `${hostile} must not escape`);
  }
  // Two ids that scrub to the same characters must NOT share a palace — that
  // would silently re-merge the two agents this scope exists to separate.
  assert.notEqual(m.palacePath('田中'), m.palacePath('佐藤'));
});

test('a file with no dated headings keeps its exact existing order', () => {
  // The safety property: undated memories behave precisely as they did before,
  // so this can never reshuffle a file it has no information about.
  const sections = ['## charlie', '## alpha', '## bravo'].map((heading) => ({ heading, body: 'x' }));
  assert.deepEqual(orderRecent(sections).map((s) => s.heading), ['## charlie', '## alpha', '## bravo']);
  assert.deepEqual(orderRecent([]), []);
});
