import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pickStudy, answeredCount } from '../src/self-check/model.js';

const check = JSON.parse(readFileSync(new URL('../data/self-check.json', import.meta.url), 'utf8'));
const tracking = JSON.parse(readFileSync(new URL('../data/tracking.json', import.meta.url), 'utf8'));

test('no pointing answers falls back to the default study', () => {
  assert.deepEqual(pickStudy(check, { cutoff: 'no', 'look-like': 'yes' }), { study: 'francis-2019', votes: 0 });
});

test('the study with the most pointing answers wins', () => {
  const r = pickStudy(check, { recommended: 'knew', cutoff: 'yes', 'look-like': 'no', 'not-asked': 'can-name' });
  assert.equal(r.study, 'francis-2019');
  assert.equal(r.votes, 2);
});

test('ties go to the study an earlier question pointed to', () => {
  assert.equal(pickStudy(check, { cutoff: 'school', major: 'mostly-boys' }).study, 'hirschl-smith-2023');
});

test('answeredCount ignores unknown option ids', () => {
  assert.equal(answeredCount(check, { recommended: 'knew', cutoff: 'bogus' }), 1);
});

test('every study an option points to exists in tracking.json', () => {
  const ids = new Set(tracking.studies.map((s) => s.id));
  assert.ok(ids.has(check.default_study));
  for (const q of check.questions) for (const o of q.options) if (o.study) assert.ok(ids.has(o.study), o.study);
});
