// Pure builders that turn the curated files in /data into MongoDB documents.
// No database access here, so the mapping is easy to test.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Data files whose records become datapoints, and the default geography for each.
const DATAPOINT_FILES = {
  'home-stats.json': { level: 'national' },
  'pipeline.json': { level: 'national' },
  'school-access.json': { level: 'state' },
  'cs-enrollment.json': { level: 'national' },
  'before-classroom.json': { level: 'national' },
  'rollback.json': { level: 'national' },
  'college.json': { level: 'national' },
  'workforce.json': { level: 'national' },
  'about.json': { level: 'institution', state: 'OH' },
  'ap-exams.json': { level: 'national' },
};

// Records that describe Ohio specifically, even inside a national file.
const OHIO_IDS = /^(osu|ohpub)-/;

const asStage = (n) => (Number.isInteger(n) && n >= 1 && n <= 6 ? n : null);

// "race:black" -> { label: "Black", race: "black" }
function groupFor(raw, dimensions) {
  if (!raw) return undefined;
  if (dimensions && /^[a-z]+(:[a-z-]+)?$/.test(raw)) {
    if (raw === 'all') return { label: 'All students' };
    const [dim, id] = raw.split(':');
    const label = dimensions.find((d) => d.id === dim)?.groups.find((g) => g.id === id)?.label ?? raw;
    return { label, [dim]: id };
  }
  return { label: raw };
}

function metricDoc(file, r, ctx = {}) {
  const verified = r.verified === true && (typeof r.value === 'number' || !('value' in r));
  const state = r.state ?? ctx.state ?? (OHIO_IDS.test(r.id) ? 'OH' : null);
  return {
    sourceFile: file,
    recordId: ctx.recordId ?? r.id,
    metric: r.metric,
    value: typeof r.value === 'number' ? r.value : null,
    unit: r.unit ?? null,
    year: typeof r.year === 'number' ? r.year : null,
    display: r.display ?? null,
    displaySecondary: r.display_secondary ?? null,
    caption: r.caption ?? null,
    dataYear: r.data_year ?? null,
    source: { title: r.source ?? null, publisher: r.source_short ?? null, url: r.url ?? null },
    verified,
    pipelineStage: asStage(r.stage),
    group: groupFor(r.group, ctx.dimensions),
    geography: state ? { level: 'state', state } : { ...DATAPOINT_FILES[file] },
    notes: r.notes ?? null,
    tags: [file.replace(/\.json$/, ''), ...(ctx.tags ?? [])],
    accessed: r.accessed ?? null,
    ...(ctx.extra ?? {}),
  };
}

// Text findings (timeline outcomes, other-side figures, notes) that carry a
// number in prose rather than a single value.
function textDoc(file, id, o, { metric, stage, tags = [] }) {
  return {
    sourceFile: file,
    recordId: id,
    metric,
    value: null,
    unit: null,
    year: typeof o.source?.year === 'number' ? o.source.year : null,
    display: o.text ?? o.figure ?? null,
    source: { title: o.source?.cite ?? null, publisher: null, url: o.source?.url ?? null },
    verified: o.verified === true && !!o.source,
    pipelineStage: asStage(stage),
    geography: { ...DATAPOINT_FILES[file] },
    notes: o.notes ?? null,
    tags: [file.replace(/\.json$/, ''), 'text-finding', ...tags],
  };
}

export function buildDatapoints(files) {
  const docs = [];
  const get = (name) => files.find(([f]) => f === name)?.[1];

  for (const r of get('home-stats.json') ?? []) docs.push(metricDoc('home-stats.json', r));

  const pipeline = get('pipeline.json');
  if (pipeline) {
    for (const s of [pipeline.baseline, ...pipeline.stages]) {
      for (const [period, recs] of Object.entries(s.values)) {
        for (const r of recs) {
          docs.push(metricDoc('pipeline.json', { ...r, stage: Number(s.n) }, {
            dimensions: pipeline.dimensions,
            tags: ['pipeline', 'share', period],
            extra: { period },
          }));
        }
      }
      for (const r of s.inputs ?? []) {
        docs.push(metricDoc('pipeline.json', { ...r, stage: Number(s.n) }, {
          dimensions: pipeline.dimensions,
          tags: ['pipeline', 'input'],
        }));
      }
    }
  }

  // Home, pipeline, and rollback have their own record formats below or above.
  const customFiles = new Set(['home-stats.json', 'pipeline.json', 'rollback.json']);
  for (const file of Object.keys(DATAPOINT_FILES)) {
    if (customFiles.has(file)) continue;
    const d = get(file);
    if (!d) continue;
    for (const c of d.charts ?? []) {
      for (const r of c.records) docs.push(metricDoc(file, r, { tags: ['chart', c.id], extra: { chartId: c.id } }));
    }
    for (const r of d.stats ?? []) docs.push(metricDoc(file, r, { tags: ['stat'] }));
    for (const r of d.research ?? []) docs.push(metricDoc(file, r, { tags: ['research'] }));
    for (const p of d.other_side?.positions ?? []) {
      if (p.figure) docs.push(textDoc(file, `other-side-${p.id}`, { ...p, text: p.figure }, { metric: `${p.who}: figure cited`, stage: 4, tags: ['other-side'] }));
    }
    if (d.note?.source) docs.push(textDoc(file, 'data-note', d.note, { metric: d.note.title, stage: 6, tags: ['note'] }));
  }

  const rollback = get('rollback.json');
  for (const ev of rollback?.events ?? []) {
    docs.push(textDoc('rollback.json', `${ev.id}-outcome`, ev.outcome, {
      metric: `${ev.title}: outcome`,
      stage: ev.stages?.[0],
      tags: ['rollback', ev.arena, ...(ev.stages ?? []).map((n) => `stage-${n}`)],
    }));
  }

  return docs;
}

// Map every URL to the pages that show it, by reading each page's build markers
// and its own links. The Methods page lists every source, so it is left out.
export function pagesBySource(root, files) {
  const data = Object.fromEntries(files);
  const urlsIn = (v, out = new Set()) => {
    if (Array.isArray(v)) v.forEach((x) => urlsIn(x, out));
    else if (v && typeof v === 'object') Object.values(v).forEach((x) => urlsIn(x, out));
    else if (typeof v === 'string' && /^https?:\/\//.test(v)) out.add(v);
    return out;
  };
  const readings = data['readings.json'] ?? [];
  const map = new Map();
  const byReading = new Map();
  const add = (url, page) => (map.get(url) ?? map.set(url, new Set()).get(url)).add(page);

  for (const page of readdirSync(root).filter((f) => f.endsWith('.html') && !['sources.html', 'styleguide.html'].includes(f))) {
    const html = readFileSync(resolve(root, page), 'utf8');
    const used = new Set();
    for (const [, file] of html.matchAll(/<!-- @(?:stats|citations|chart|chart-citations|cards|card-notes|studies|study-notes|programs|debate|data-note|law-box|other-side|other-side-notes|cascade-intro|cascade-foot) ([\w-]+)/g)) {
      used.add(`${file}.json`);
    }
    if (/<!-- @(timeline) -->/.test(html)) used.add('rollback.json');
    if (/<!-- @(pipeline-source|pipeline-table|datasets|student-access) -->/.test(html) || /src\/pipeline\/diagram\.js/.test(html)) used.add('pipeline.json');
    for (const f of used) if (data[f]) urlsIn(data[f]).forEach((u) => add(u, page));
    for (const [, id] of html.matchAll(/<!-- @fromclass ([\w-]+) -->/g)) {
      const r = readings.find((x) => x.id === id);
      if (r) {
        urlsIn(r).forEach((u) => add(u, page));
        (byReading.get(id) ?? byReading.set(id, new Set()).get(id)).add(page);
      }
    }
    for (const [, href] of html.matchAll(/href="(https?:\/\/[^"]+)"/g)) add(href, page);
  }
  return { byUrl: map, byReading };
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);

export function buildSources(bibliography, { byUrl, byReading }, readings = []) {
  return bibliography.entries.map((e) => {
    const pages = new Set(e.url ? byUrl.get(e.url) ?? [] : []);
    // References without a URL (some readings): match them to the From class
    // cards that cite the same author, then use the pages those cards are on.
    if (!e.url) {
      const surname = e.apa.split(',')[0].trim().toLowerCase();
      for (const r of readings) {
        const cites = r.works.map((w) => w.cite.toLowerCase()).join(' ');
        if (cites.includes(surname)) (byReading.get(r.id) ?? []).forEach((p) => pages.add(p));
      }
    }
    return {
      // Keyed on the citation, not the URL: two chapters of one book share a URL.
      key: slug(e.apa),
      apa: e.apa,
      type: e.type,
      kind: e.kind,
      url: e.url ?? null,
      pages: [...pages].sort(),
      pending: e.pending === true,
    };
  });
}

export function readDataDir(root) {
  const dir = resolve(root, 'data');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f, JSON.parse(readFileSync(resolve(dir, f), 'utf8'))]);
}
