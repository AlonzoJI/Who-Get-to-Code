import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dataDir = new URL('../data/', import.meta.url);
const bib = JSON.parse(readFileSync(new URL('bibliography.json', dataDir), 'utf8'));

// Every URL used anywhere in /data must have a bibliography entry, so the
// Methods and sources page can't silently fall out of date.
test('every URL cited in /data appears in the bibliography', () => {
  const cited = new Set(bib.entries.map((e) => e.url).filter(Boolean));
  const missing = [];
  const walk = (v, file) => {
    if (Array.isArray(v)) v.forEach((x) => walk(x, file));
    else if (v && typeof v === 'object') Object.values(v).forEach((x) => walk(x, file));
    else if (typeof v === 'string' && /^https?:\/\//.test(v) && !cited.has(v)) missing.push(`${file}: ${v}`);
  };
  for (const f of readdirSync(dataDir).filter((f) => f.endsWith('.json') && f !== 'bibliography.json')) {
    walk(JSON.parse(readFileSync(new URL(f, dataDir), 'utf8')), f);
  }
  assert.deepEqual(missing, []);
});

test('every bibliography entry has APA text and a kind', () => {
  for (const e of bib.entries) {
    assert.ok(e.apa && e.apa.length > 10, JSON.stringify(e));
    assert.ok(['source', 'reading', 'dataset'].includes(e.kind), e.apa);
  }
});
