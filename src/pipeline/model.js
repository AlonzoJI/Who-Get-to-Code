// Pure pipeline math: no DOM, so it runs under `node --test`.

export function groupKey(dimensionId, groupId) {
  return dimensionId === 'all' ? 'all' : `${dimensionId}:${groupId}`;
}

// The record a stage uses for a group. Stages without before/after data use
// their single "current" set no matter which period is selected.
export function recordFor(stage, key, period) {
  const set = stage.has_periods ? stage.values[period] : stage.values.current;
  return set?.find((r) => r.group === key) ?? null;
}

// A value only removes students when it is a real, verified number.
export const isUsable = (record) =>
  record != null && record.verified === true && typeof record.value === 'number';

// Walk a cohort through every stage. Counts come from the cumulative product of
// rates, rounded once per stage, so rounding never drifts across six steps.
export function simulate(pipeline, key, period) {
  const cohort = pipeline.cohort_size;
  let share = 1;
  let previous = cohort;
  return pipeline.stages.map((stage) => {
    const record = recordFor(stage, key, period);
    const usable = isUsable(record);
    if (usable) share *= Math.min(Math.max(record.value, 0), 100) / 100;
    const reached = Math.round(cohort * share);
    const step = { stage, record, usable, entered: previous, reached, dropped: previous - reached };
    previous = reached;
    return step;
  });
}

export const anyPlaceholder = (steps) => steps.some((s) => !s.usable);

export function estimateFunnel({ cohort_size, inputs, steps }) {
  const product = (rows) => rows.reduce((value, row) =>
    value * (isUsable(row) ? row.value / (row.unit === 'percent' ? 100 : 1) : NaN), 1);
  let remaining = cohort_size;
  return steps.map((step) => {
    const numerator = step.numerator.map((key) => inputs[key]);
    const denominator = step.denominator.map((key) => inputs[key]);
    const ratio = product(numerator) / product(denominator);
    const rate = ratio >= 0 && ratio <= 1 ? ratio : null;
    const entered = remaining === null ? null : Math.round(remaining);
    remaining = rate === null || remaining === null ? null : remaining * rate;
    const reached = remaining === null ? null : Math.round(remaining);
    return {
      ...step, rate, entered, reached,
      dropped: reached === null ? null : entered - reached,
      sources: [...new Map([...numerator, ...denominator]
        .filter(isUsable).map((row) => [row.url, row])).values()],
    };
  });
}
