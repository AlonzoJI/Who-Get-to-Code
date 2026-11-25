import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  groupKey, recordFor, seriesFor, segments, columns, columnHasGap, isUsable, niceMax,
} from '../src/pipeline/representation.js';

const load = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));

// Test fixture only. These shares are made up to exercise the logic and never ship.
const rec = (group, value, verified = true) => ({ group, value, verified });
const fixture = {
  periods: [{ id: 'before', label: 'Before' }, { id: 'after', label: 'After' }],
  dimensions: [{ id: 'all', groups: [{ id: 'all' }] }, { id: 'sex', groups: [{ id: 'a' }, { id: 'b' }] }],
  baseline: { n: '00', values: { current: [rec('sex:a', 50), rec('sex:b', 50)] } },
  stages: [
    { n: '01', values: { current: [rec('sex:a', 40), rec('sex:b', 60)] } },
    { n: '02', values: { current: [rec('sex:a', null, false), rec('sex:b', null, false)] } },
    { n: '03', has_periods: true, values: { before: [rec('sex:a', 25), rec('sex:b', 75)], after: [rec('sex:a', 20), rec('sex:b', 80)] } },
  ],
};

test('each point is the stage record itself, and the index divides by the baseline share', () => {
  const [a] = seriesFor(fixture, 'sex', 'before');
  assert.deepEqual(a.points.map((p) => p.value), [50, 40, null, 25]);
  assert.deepEqual(a.points.map((p) => p.index), [1, 0.8, null, 0.5]);
  assert.equal(a.baseValue, 50);
});

test('an unverified record is a gap that splits the line', () => {
  const [a] = seriesFor(fixture, 'sex', 'after');
  assert.deepEqual(segments(a.points).map((run) => run.map((p) => p.col)), [[0, 1], [3]]);
  assert.equal(columnHasGap(fixture.stages[1], 'sex', 'after'), true);
  assert.equal(isUsable(rec('x', 10, false)), false);
});

test('the period toggle only changes columns that have both periods', () => {
  const [before] = seriesFor(fixture, 'sex', 'before');
  const [after] = seriesFor(fixture, 'sex', 'after');
  assert.equal(before.points[1].value, after.points[1].value);
  assert.notEqual(before.points[3].value, after.points[3].value);
  assert.deepEqual(seriesFor(fixture, 'all', 'after'), []);
});

test('the y axis rounds up and always shows parity in the index view', () => {
  assert.equal(niceMax([12, 44.3], 'share'), 50);
  assert.equal(niceMax([0.4, 0.8], 'index'), 1.5);
  assert.equal(niceMax([5.03], 'index'), 6);
});

test('the shipped pipeline.json has a record for every group at every column with source fields', () => {
  const data = load('pipeline');
  assert.equal(data.stages.length, 6);
  assert.equal(groupKey('race', 'black'), 'race:black');
  const keys = data.dimensions.filter((d) => d.id !== 'all').flatMap((d) => d.groups.map((g) => groupKey(d.id, g.id)));
  for (const column of columns(data)) {
    for (const period of column.has_periods ? ['before', 'after'] : ['current']) {
      for (const key of keys) {
        const r = recordFor(column, key, period);
        assert.ok(r, `${column.n} ${period} ${key} exists`);
        for (const field of ['source', 'year', 'url', 'verified']) assert.ok(field in r, `${r.id} has ${field}`);
        if (r.verified) {
          assert.equal(typeof r.value, 'number', r.id);
          assert.ok(r.source && r.url && typeof r.year === 'number', `${r.id} is sourced`);
          assert.equal(r.unit, 'percent of stage population', r.id);
        } else assert.equal(r.value, null, r.id);
      }
    }
  }
  assert.deepEqual(data.stages.filter((s) => s.has_periods).map((s) => s.n), ['04']);
});

test('every fully verified column is a set of shares of one population, never a chained product', () => {
  const data = load('pipeline');
  for (const column of columns(data)) {
    for (const records of Object.values(column.values)) {
      for (const dim of ['race', 'gender', 'income']) {
        const set = records.filter((r) => r.group.startsWith(`${dim}:`));
        if (!set.every(isUsable)) continue;
        const total = set.reduce((sum, r) => sum + r.value, 0);
        assert.ok(Math.abs(total - 100) < 0.1, `${column.n} ${dim} sums to ${total}`);
      }
    }
  }
});

test('stage points match their own source files', () => {
  const data = load('pipeline');
  const crdc = load('cs-enrollment').charts.find((c) => c.id === 'crdc-us').records;
  const total = crdc.reduce((s, r) => s + r.value, 0);
  const black = crdc.filter((r) => r.id.startsWith('crdc-cs-us-bl-')).reduce((s, r) => s + r.value, 0);
  assert.equal(recordFor(data.stages[1], 'race:black', 'after').value, Math.round((10000 * black) / total) / 100);
  assert.equal(recordFor(data.stages[4], 'gender:female', 'after').value,
    load('workforce').charts.find((c) => c.id === 'cs-degrees').records.find((r) => r.id === 'cs-deg-women').value);
  assert.notEqual(recordFor(data.stages[3], 'race:black', 'before').value, recordFor(data.stages[3], 'race:black', 'after').value);
});

test('derived points are flagged and stage 1 keeps the published access rates', () => {
  const data = load('pipeline');
  const s1 = data.stages[0];
  assert.ok(s1.values.current.filter((r) => r.group.startsWith('race:')).every((r) => r.derived === true));
  assert.equal(s1.inputs.find((r) => r.group === 'race:black').value, 80);
  assert.equal(recordFor(data.stages[5], 'race:pacific-islander', 'after').verified, false);
});
