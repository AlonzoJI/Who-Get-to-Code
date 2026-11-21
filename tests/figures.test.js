import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { collectFigures } from '../lib/render.js';

const dataDir = new URL('../data/', import.meta.url);
const files = readdirSync(dataDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => [f, JSON.parse(readFileSync(new URL(f, dataDir), 'utf8'))]);
const rows = collectFigures(files);

test('collects figures from every data file that shows numbers', () => {
  const seen = new Set(rows.map((r) => r.file));
  for (const f of ['home-stats.json', 'pipeline.json', 'before-classroom.json', 'rollback.json', 'college.json', 'workforce.json', 'about.json']) {
    assert.ok(seen.has(f), f);
  }
});

test('the 84 pipeline placeholders are all unverified', () => {
  const p = rows.filter((r) => r.file === 'pipeline.json');
  assert.equal(p.length, 84);
  assert.ok(p.every((r) => !r.verified && r.value === null));
});

test('a verified row always has a value and a source', () => {
  for (const r of rows.filter((x) => x.verified)) {
    assert.ok(r.value, JSON.stringify(r));
    assert.ok(r.source, JSON.stringify(r));
  }
});
