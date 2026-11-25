// Representation chart data. Pure, so it runs under `node --test` and in the build.
//
// Each point is one group's share of the people at one stage, read straight from
// that stage's record in data/pipeline.json. Nothing is multiplied or carried
// from one stage to the next. A record without a verified number is a gap.

export const groupKey = (dimensionId, groupId) => `${dimensionId}:${groupId}`;

export const isUsable = (record) =>
  record != null && record.verified === true && typeof record.value === 'number';

// The baseline column, then the six stages, in chart order.
export const columns = (pipeline) => [pipeline.baseline, ...pipeline.stages];

// The record set a column uses. Stages with before and after data follow the
// period toggle; every other column has a single "current" set.
export function recordsFor(column, period) {
  return column.has_periods ? column.values[period] : column.values.current;
}

export function recordFor(column, key, period) {
  return recordsFor(column, period)?.find((r) => r.group === key) ?? null;
}

// One series per group in the dimension: the baseline share and a point per stage.
export function seriesFor(pipeline, dimensionId, period) {
  const dimension = pipeline.dimensions.find((d) => d.id === dimensionId);
  if (!dimension || dimensionId === 'all') return [];
  const cols = columns(pipeline);
  return dimension.groups.map((group) => {
    const key = groupKey(dimensionId, group.id);
    const base = recordFor(pipeline.baseline, key, period);
    const baseValue = isUsable(base) ? base.value : null;
    const points = cols.map((column, col) => {
      const record = recordFor(column, key, period);
      const usable = isUsable(record);
      return {
        col,
        column,
        record,
        value: usable ? record.value : null,
        index: usable && baseValue ? record.value / baseValue : null,
      };
    });
    return { group, key, base, baseValue, points };
  });
}

// Split a series into runs of consecutive points with values, so gaps break the line.
export function segments(points, field = 'value') {
  const runs = [];
  let run = [];
  for (const p of points) {
    if (p[field] === null) {
      if (run.length) runs.push(run);
      run = [];
    } else run.push(p);
  }
  if (run.length) runs.push(run);
  return runs;
}

// Sources used by one column for one dimension, unique by url.
export function columnSources(column, dimensionId, period) {
  const sets = column.has_periods ? [column.values[period]] : Object.values(column.values);
  const records = sets.flat().filter((r) =>
    isUsable(r) && (dimensionId === 'all' || r.group.startsWith(`${dimensionId}:`)));
  return [...new Map(records.map((r) => [r.url, r])).values()];
}

// Whether a column has a gap for any group in the dimension.
export function columnHasGap(column, dimensionId, period) {
  const records = (recordsFor(column, period) ?? []).filter((r) =>
    dimensionId === 'all' || r.group.startsWith(`${dimensionId}:`));
  return records.some((r) => !isUsable(r));
}

export const columnDerived = (column, dimensionId, period) =>
  (recordsFor(column, period) ?? []).some((r) => r.derived && r.group.startsWith(`${dimensionId}:`));

// "2023–24" or "Fall 2023 before, fall 2024 after".
export function periodNote(column, pipeline, dimensionId = 'all') {
  if (!column.has_periods) {
    const years = [...new Set(Object.values(column.values).flat()
      .filter((r) => isUsable(r) && (dimensionId === 'all' || r.group.startsWith(`${dimensionId}:`)))
      .map((r) => r.data_year ?? r.year))];
    if (!years.length) return 'One period only. No verified figure for this group type yet.';
    return `One period only: ${years.join('; ')}`;
  }
  return pipeline.periods.map((p) => {
    const year = column.values[p.id].find(isUsable)?.data_year;
    return `${p.label.replace(' the rollback', '')}: ${year}`;
  }).join(' · ');
}

// Nice upper bound for the y axis.
export function niceMax(values, view) {
  const max = Math.max(...values.filter((v) => v !== null), view === 'index' ? 1 : 0);
  const step = view === 'index' ? (max > 4 ? 1 : 0.5) : max > 70 ? 20 : 10;
  return Math.max(step, Math.ceil((max * 1.05) / step) * step);
}
