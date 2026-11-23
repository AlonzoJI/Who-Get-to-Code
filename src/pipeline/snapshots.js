// Each stage describes its own population. Only the transition model chains rates.
import { groupKey, isUsable, recordFor } from './model.js';

const raceIds = {
  'american-indian': 'aian',
  'pacific-islander': 'nhpi',
};
const crdcRaceIds = {
  'american-indian': 'am', asian: 'as', black: 'bl', hispanic: 'hi',
  'pacific-islander': 'hp', white: 'wh', multiracial: 'tr',
};
const collegeYears = { before: 2023, after: 2024 };
const recordsFor = (charts, id) => charts.find((chart) => chart.id === id)?.records ?? [];

function share(records, selected, field = 'value') {
  const matching = records.filter(selected);
  if (!matching.length || !records.every((row) => isUsable(row)
    && Number.isFinite(row[field]) && row[field] >= 0)) return null;
  const sum = (rows) => rows.reduce((total, row) => total + row[field], 0);
  const total = sum(records);
  return total > 0 ? { value: 100 * sum(matching) / total, source: matching[0] } : null;
}

function published(record) {
  return isUsable(record) ? { value: record.value, source: record } : null;
}

export function stageSnapshots(pipeline, { enrollment, exams, college, workforce }, dimension, group, period) {
  const isRace = dimension === 'race';
  const demographic = isRace || dimension === 'gender';
  const raceId = raceIds[group] ?? group;
  const sexId = { female: 'women', male: 'men' }[group];
  const matchesSuffix = (id) => (row) => row.id.endsWith('-' + id);
  const collegeYear = collegeYears[period];
  const collegeRows = college.filter((chart) => chart.id.startsWith(`first-time-${collegeYear}-`))
    .flatMap((chart) => chart.records);
  const metrics = [
    ['School access', 'of students in this group attend a public high school that offers foundational CS',
      published(recordFor(pipeline.stages[0], groupKey(dimension, group), period))],
    ['High school enrollment', 'of reported U.S. high school CS enrollees in the female and male counts',
      demographic && share(recordsFor(enrollment, 'crdc-us'), isRace
        ? (row) => row.id.startsWith(`crdc-cs-us-${crdcRaceIds[group]}-`)
        : matchesSuffix(group === 'female' ? 'f' : 'm'))],
    ['AP exams', 'of AP Computer Science Principles exam takers',
      demographic && share(recordsFor(exams, `ap-csp-${dimension}`), matchesSuffix(isRace ? raceId : group))],
    ['College enrollment', 'of first-time undergraduates at the matched IPEDS colleges',
      isRace && share(collegeRows, matchesSuffix(raceId), 'enrolled_count')],
    ['CS degrees', 'of computer and information sciences bachelor’s awards',
      demographic && published(recordsFor(workforce, 'cs-degrees')
        .find((row) => row.id === `cs-deg-${isRace ? raceId : sexId}`))],
    ['Workforce', 'of U.S. computer and mathematical scientists with a bachelor’s degree or higher',
      demographic && published(recordsFor(workforce, 'tech-workforce')
        .find((row) => row.id === `tech-wf-${isRace ? raceId : sexId}`))],
  ];
  return metrics.map(([title, description, result], i) => ({
    stage: pipeline.stages[i], title, description, ...(result || {}),
  }));
}
