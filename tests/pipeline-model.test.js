import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulate, groupKey, recordFor, anyPlaceholder } from '../src/pipeline/model.js';
import { projectPipeline, scaleOdds } from '../src/pipeline/projection.js';

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

const load = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
const shipped = () => ({
  pipeline: load('pipeline'),
  estimates: load('pipeline-estimates'),
  charts: {
    enrollment: load('cs-enrollment').charts,
    exams: load('ap-exams').charts,
    college: load('college').charts,
    workforce: load('workforce').charts,
  },
});
const project = (data, dimension, group, period = 'after') => projectPipeline({ ...data, dimension, group, period });
const per10k = (steps) => steps.map((s) => Math.round(s.projectedReached * 100 * 10) / 10);

test('scaling odds keeps rates between 0 and 1', () => {
  assert.equal(scaleOdds(0.5, 1), 0.5);
  assert.ok(Math.abs(scaleOdds(0.82, 3) - 0.9318) < 1e-4);
  assert.ok(scaleOdds(0.99, 100) < 1);
  assert.equal(scaleOdds(0, 5), 0);
});

test('the all-students projection drops students at every stage from cited inputs', () => {
  const data = shipped();
  const steps = project(data, 'all', 'all');
  assert.deepEqual(per10k(steps), [7800, 689, 112.1, 91.9, 10.1, 5.1]);
  assert.deepEqual(steps.map((s) => s.reached), [78, 7, 1, 1, 0, 0]);
  assert.ok(steps.every((s) => s.rate > 0 && s.rate < 1 && s.entered === s.reached + s.dropped));
  assert.ok(steps.every((s) => s.sources.length && s.sources.every((r) => r.verified && r.url && r.year)));
});

test('group steps compare matching populations and fall back to the all-students rate', () => {
  const data = shipped();
  const black = project(data, 'race', 'black');
  assert.equal(black[0].method, 'published');
  assert.equal(black[0].rate, 0.8);
  assert.ok(black.slice(1).every((s) => s.method === 'group'));
  assert.equal(black[2].compare.num.label, 'AP CSP takers');
  assert.equal(black[2].compare.den.label, 'CS enrollees');
  assert.ok(black[2].rate < black[2].allRate);

  const female = project(data, 'gender', 'female');
  assert.equal(female[3].method, 'all');
  assert.equal(female[4].compare.den.label, 'AP CSP takers');
  assert.equal(project(data, 'race', 'pacific-islander')[5].method, 'all');
  assert.deepEqual(per10k(project(data, 'income', 'low-income')), per10k(project(data, 'all', 'all')));
});

test('the period toggle only changes the college step for race groups', () => {
  const data = shipped();
  const before = project(data, 'race', 'black', 'before');
  const after = project(data, 'race', 'black', 'after');
  assert.notEqual(before[3].rate, after[3].rate);
  assert.deepEqual([0, 1, 2, 4, 5].map((i) => before[i].rate), [0, 1, 2, 4, 5].map((i) => after[i].rate));
});

test('an unverified input stops the projection instead of inventing a rate', () => {
  const data = shipped();
  data.estimates.inputs['ap-csp'].verified = false;
  const steps = project(data, 'all', 'all');
  assert.equal(steps[2].rate, null);
  assert.equal(steps[5].reached, null);
});
