// Projected pipeline for the home page animation. Pure, so it runs under `node --test`.
//
// All students: each step's rate is a ratio of cited figures (data/pipeline-estimates.json).
// One group: the all-students rate is adjusted by how the group's share changes between
// two populations that match the step, for example its share of AP CSP takers compared
// with its share of CS enrollees. The adjustment scales the odds, so a rate stays
// between 0 and 100%. Where no breakdown exists, the step keeps the all-students rate.
// The chained result is an illustrative projection, not a cohort followed over time.
import { groupKey, recordFor, isUsable } from './model.js';

const RACE_CODES = {
  'american-indian': ['am', 'aian'], asian: ['as', 'asian'], black: ['bl', 'black'],
  hispanic: ['hi', 'hispanic'], 'pacific-islander': ['hp', 'nhpi'], white: ['wh', 'white'],
  multiracial: ['tr', 'multiracial'],
};
const FOUR_YEAR_TIERS = ['highly-selective', 'selective', 'less-selective'];
export const COLLEGE_YEAR = { before: 2023, after: 2024 };

export const POPULATIONS = {
  base: 'public high school students',
  access: 'high schoolers at schools offering CS',
  cs: 'CS enrollees',
  ap: 'AP CSP takers',
  college: 'first-time four-year college students',
  entrants2023: 'fall 2023 first-time four-year college students',
  degree: 'CS bachelor’s awards',
  workforce: 'computer and mathematical scientists',
};

// Which two populations each step compares, in order of preference for the denominator.
const STEP_SHARES = [
  null,
  { num: 'cs', den: ['access'] },
  { num: 'ap', den: ['cs'] },
  { num: 'college', den: ['base'] },
  { num: 'degree', den: ['entrants2023', 'ap'] },
  { num: 'workforce', den: ['degree'] },
];

const recordsOf = (charts, id) => charts.find((chart) => chart.id === id)?.records ?? [];
const asRate = (record) => record.value / (String(record.unit).startsWith('percent') ? 100 : 1);

// rows: [groupId or null, value, record]. A null group counts toward the total only.
function toShares(rows) {
  if (!rows.length || rows.some(([, value, record]) => !isUsable(record) || !(value >= 0))) return null;
  const total = rows.reduce((sum, [, value]) => sum + value, 0);
  if (!(total > 0)) return null;
  const shares = {};
  for (const [group, value] of rows) if (group) shares[group] = (shares[group] ?? 0) + value / total;
  return { shares, sources: rows.map(([, , record]) => record) };
}

// Match each record to a group by the id suffix; unmatched rows are excluded entirely.
function bySuffix(records, suffixes, extra = []) {
  return records.flatMap((record) => {
    const match = Object.entries(suffixes).find(([, suffix]) => record.id.endsWith(`-${suffix}`));
    if (match) return [[match[0], record.value, record]];
    return extra.some((suffix) => record.id.endsWith(`-${suffix}`)) ? [[null, record.value, record]] : [];
  });
}

const raceSuffix = (index) => Object.fromEntries(Object.entries(RACE_CODES).map(([g, codes]) => [g, codes[index]]));
const SEX_SUFFIX = { female: 'female', male: 'male' };
const WOMEN_SUFFIX = { female: 'women', male: 'men' };

function shareTable(kind, dimension, ctx) {
  const { estimates, charts, pipeline, period } = ctx;
  const race = dimension === 'race';
  if (dimension !== 'race' && dimension !== 'gender') return null;
  switch (kind) {
    case 'base': {
      const rows = race ? estimates.baselines.race : estimates.baselines.sex;
      return toShares(rows.map((r) => [r.group, r.value, r]));
    }
    case 'access': {
      const base = shareTable('base', dimension, ctx);
      if (!base) return null;
      const all = recordFor(pipeline.stages[0], 'all', period);
      const rows = Object.entries(base.shares).map(([group, share]) => {
        const own = recordFor(pipeline.stages[0], groupKey(dimension, group), period);
        const access = isUsable(own) ? own : all;
        return [group, share * asRate(access), access];
      });
      const weighted = toShares(rows);
      return weighted && { ...weighted, sources: [...base.sources, ...weighted.sources] };
    }
    case 'cs': {
      const records = recordsOf(charts.enrollment, 'crdc-us');
      const rows = records.map((r) => {
        const [, code, sex] = r.id.match(/^crdc-cs-us-([a-z]+)-([fm])$/) ?? [];
        const group = race
          ? Object.keys(RACE_CODES).find((g) => RACE_CODES[g][0] === code)
          : { f: 'female', m: 'male' }[sex];
        return [group ?? null, r.value, r];
      });
      return toShares(rows);
    }
    case 'ap':
      return toShares(race
        ? bySuffix(recordsOf(charts.exams, 'ap-csp-race'), raceSuffix(1))
        : bySuffix(recordsOf(charts.exams, 'ap-csp-gender'), SEX_SUFFIX));
    case 'college':
    case 'entrants2023': {
      if (!race) return null;
      const year = kind === 'college' ? COLLEGE_YEAR[period] : 2023;
      const rows = FOUR_YEAR_TIERS.flatMap((tier) =>
        bySuffix(recordsOf(charts.college, `first-time-${year}-${tier}`), raceSuffix(1))
          .map(([g, , r]) => [g, r.enrolled_count, r]));
      return toShares(rows);
    }
    case 'degree':
      return toShares(bySuffix(recordsOf(charts.workforce, 'cs-degrees'), race ? raceSuffix(1) : WOMEN_SUFFIX));
    case 'workforce':
      return toShares(bySuffix(recordsOf(charts.workforce, 'tech-workforce'),
        race ? raceSuffix(1) : WOMEN_SUFFIX, race ? ['other'] : []));
    default:
      return null;
  }
}

export function scaleOdds(rate, ratio) {
  if (rate <= 0) return 0;
  if (rate >= 1) return 1;
  const odds = (rate / (1 - rate)) * ratio;
  return odds / (1 + odds);
}

// The all-students rate for each step, from the cited inputs.
export function allStudentRates(pipeline, estimates, period = 'after') {
  const inputs = { ...estimates.inputs, 'school-access': recordFor(pipeline.stages[0], 'all', period) };
  const product = (keys) => keys.reduce((value, key) =>
    value * (isUsable(inputs[key]) ? asRate(inputs[key]) : NaN), 1);
  return estimates.steps.map((step) => {
    const rate = product(step.numerator) / product(step.denominator);
    const sources = [...step.numerator, ...step.denominator].map((key) => inputs[key]);
    return { rate: rate >= 0 && rate <= 1 ? rate : null, sources };
  });
}

const uniqueByUrl = (records) => [...new Map(records.filter(Boolean).map((r) => [r.url, r])).values()];

export function projectPipeline({ pipeline, estimates, charts, dimension, group, period }) {
  const ctx = { pipeline, estimates, charts, period };
  const allRates = allStudentRates(pipeline, estimates, period);
  const cohort = pipeline.cohort_size;
  let share = 1;
  let previous = cohort;
  let projectedPrevious = cohort;

  return pipeline.stages.map((stage, i) => {
    const step = estimates.steps[i];
    const all = allRates[i];
    let rate = all.rate;
    let method = 'all';
    let compare = null;
    let sources = all.sources;

    if (dimension !== 'all' && rate !== null) {
      if (i === 0) {
        const own = recordFor(stage, groupKey(dimension, group), period);
        if (isUsable(own)) { rate = asRate(own); method = 'published'; sources = [own]; }
      } else {
        const config = STEP_SHARES[i];
        const num = shareTable(config.num, dimension, ctx);
        const denKind = config.den.find((kind) => shareTable(kind, dimension, ctx)?.shares[group] > 0);
        const den = denKind && shareTable(denKind, dimension, ctx);
        if (num?.shares[group] > 0 && den) {
          const ratio = num.shares[group] / den.shares[group];
          rate = scaleOdds(all.rate, ratio);
          method = 'group';
          compare = {
            num: { label: POPULATIONS[config.num], share: num.shares[group] },
            den: { label: POPULATIONS[denKind], share: den.shares[group] },
            ratio,
          };
          sources = [...all.sources, ...num.sources, ...den.sources];
        }
      }
    }

    if (rate === null) share = NaN;
    else share *= rate;
    const projected = cohort * share;
    const reached = Number.isFinite(projected) ? Math.round(projected) : null;
    const result = {
      stage, label: step.label, rate, allRate: all.rate, method, compare,
      notes: step.notes, groupMethod: step.group_method,
      sources: uniqueByUrl(sources),
      entered: previous, reached, dropped: reached === null ? null : previous - reached,
      projectedEntered: projectedPrevious, projectedReached: projected,
    };
    previous = reached;
    projectedPrevious = projected;
    return result;
  });
}
