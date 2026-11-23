import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulate, groupKey, recordFor, anyPlaceholder } from '../src/pipeline/model.js';

// Test fixture only. These rates are made up to exercise the math and never ship.
const stage = (n, values, has_periods = false) => ({ id: `stage-${n}`, n: `0${n}`, has_periods, values });
const rec = (group, value, verified = true) => ({ group, value, verified });
const fixture = {
  cohort_size: 100,
  stages: [
    stage(1, { current: [rec('all', 50)] }),
    stage(2, { current: [rec('all', 50)] }),
    stage(3, { current: [rec('all', null, false)] }),
    stage(4, { before: [rec('all', 80)], after: [rec('all', 40)] }, true),
  ],
};

test('groupKey joins dimension and group, except for all students', () => {
  assert.equal(groupKey('race', 'black'), 'race:black');
  assert.equal(groupKey('all', 'all'), 'all');
});

test('verified rates remove students using the cumulative share', () => {
  const steps = simulate(fixture, 'all', 'before');
  assert.deepEqual(steps.map((s) => s.reached), [50, 25, 25, 20]);
  assert.deepEqual(steps.map((s) => s.dropped), [50, 25, 0, 5]);
});

test('an unverified or missing value removes no one and is flagged', () => {
  const steps = simulate(fixture, 'all', 'before');
  assert.equal(steps[2].usable, false);
  assert.equal(steps[2].dropped, 0);
  assert.equal(anyPlaceholder(steps), true);
  assert.equal(simulate(fixture, 'race:black', 'before').every((s) => s.dropped === 0), true);
});

test('the period toggle only changes stages that have both periods', () => {
  const before = simulate(fixture, 'all', 'before');
  const after = simulate(fixture, 'all', 'after');
  assert.equal(before[1].reached, after[1].reached);
  assert.equal(after[3].reached, 10);
});

test('a verified: false record is ignored even if it has a value', () => {
  const s = stage(1, { current: [rec('all', 10, false)] });
  assert.equal(simulate({ cohort_size: 100, stages: [s] }, 'all', 'before')[0].dropped, 0);
});

test('the shipped pipeline.json has every stage and group with source metadata', () => {
  const data = JSON.parse(readFileSync(new URL('../data/pipeline.json', import.meta.url), 'utf8'));
  const keys = data.dimensions.flatMap((d) => d.groups.map((g) => groupKey(d.id, g.id)));
  assert.equal(data.stages.length, 6);
  for (const st of data.stages) {
    for (const period of st.has_periods ? ['before', 'after'] : ['current']) {
      for (const key of keys) {
        const r = recordFor(st, key, period);
        assert.ok(r, `${st.id} ${period} ${key} exists`);
        for (const field of ['source', 'year', 'url', 'verified']) assert.ok(field in r, `${r.id} has ${field}`);
      }
    }
  }
  assert.equal(data.stages.filter((s) => s.has_periods).map((s) => s.id).join(), 'stage-4');
  assert.equal(simulate(data, 'all', 'before')[0].reached, 78);
  assert.equal(simulate(data, 'race:black', 'before')[0].reached, 80);
  assert.equal(simulate(data, 'income:low-income', 'before')[0].usable, false);
});
