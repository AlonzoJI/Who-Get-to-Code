// Representation chart for the outcomes pipeline. One line per group shows its
// share of the people at each stage; a dashed line marks its share of all high
// school students. Every point comes from that stage's own record in
// data/pipeline.json (see representation.js). Stages are never chained.
import '../styles/pipeline.css';
import pipeline from '../../data/pipeline.json';
import {
  columns, seriesFor, segments, columnSources, columnHasGap, columnDerived, periodNote, niceMax,
  isUsable,
} from './representation.js';
import { isUnsourcedPlaceholder, loadDatapoints } from '../data-client.js';

const NS = 'http://www.w3.org/2000/svg';
const DEFAULT_HIGHLIGHT = { race: 'black' };
const COLORED = { gender: ['female', 'male'], income: ['low-income', 'not-low-income'] };

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const svgEl = (tag, attrs = {}, text) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  return el;
};
const html = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};
const pct = (v) => `${Number(v.toFixed(v < 1 ? 2 : 1))}%`;
const ratio = (v) => `${v.toFixed(2)}×`;
// "Students at..." -> "students at...", but keep "AP Computer Science...".
const lowerFirst = (t) => (/^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);

function layoutFor(width) {
  const narrow = width < 640;
  const W = narrow ? 360 : 1000;
  const H = narrow ? 320 : 420;
  const m = narrow ? { top: 22, right: 16, bottom: 46, left: 44 } : { top: 26, right: 80, bottom: 58, left: 64 };
  const cols = columns(pipeline).length;
  const innerW = W - m.left - m.right;
  return {
    narrow, W, H, m,
    x: (col) => m.left + (innerW * col) / (cols - 1),
    yFor: (max) => (v) => m.top + (H - m.top - m.bottom) * (1 - v / max),
  };
}

export function mountPipeline(root) {
  const state = { dimension: 'race', group: DEFAULT_HIGHLIGHT.race, period: 'after', view: 'share', runId: 0 };
  const periodColumns = columns(pipeline).filter((c) => c.has_periods);

  root.replaceChildren();
  root.classList.add('engine');

  // ── controls ──
  const bar = html('div', 'eng-bar');
  const seg = (name, legend, options, checked) => {
    const set = html('fieldset', 'seg');
    set.append(html('legend', 'label', legend));
    for (const o of options) {
      const id = `pl-${name}-${o.id}`;
      const input = Object.assign(document.createElement('input'), { type: 'radio', name: `pl-${name}`, id, value: o.id, checked: o.id === checked });
      const lab = html('label', null, o.label);
      lab.htmlFor = id;
      set.append(input, lab);
    }
    return set;
  };
  const dimSet = seg('dim', 'Group by', pipeline.dimensions.map((d) => ({ id: d.id, label: d.short })), state.dimension);
  const groupWrap = html('label', 'pl-select');
  groupWrap.append(html('span', 'label', 'Highlight'));
  const groupSelect = document.createElement('select');
  groupWrap.append(groupSelect);

  const perSet = seg('per', 'Period', pipeline.periods.map((p) => ({ id: p.id, label: p.label.replace(' the rollback', '') })), state.period);
  const perNote = html('span', 'pl-note',
    `Changes stage ${periodColumns.map((c) => c.n).join(', ')} only. Other stages have one period.`);
  perNote.id = 'pl-per-note';
  perSet.setAttribute('aria-describedby', perNote.id);
  const perGroup = html('div', 'pl-pergroup');
  perGroup.append(perSet, perNote);

  const viewSet = seg('view', 'Show', [{ id: 'share', label: 'Share' }, { id: 'index', label: 'Index' }], state.view);

  const runBtn = html('button', 'btn primary sm', 'Run');
  runBtn.type = 'button';
  const resetBtn = html('button', 'btn text sm', 'Reset');
  resetBtn.type = 'button';
  const actions = html('div', 'pl-actions');
  actions.append(runBtn, resetBtn);

  const controls = html('div', 'pl-controls');
  controls.append(dimSet, groupWrap, perGroup, viewSet);
  bar.append(controls, actions);

  const status = html('div', 'pl-status');
  const legend = html('div', 'pl-legend');
  const badgeSlot = html('span');
  status.append(legend, badgeSlot);

  // ── chart + stage log ──
  const body = html('div', 'eng-body');
  const canvas = html('div', 'eng-canvas');
  const svg = svgEl('svg', { role: 'group', 'aria-labelledby': 'pl-svg-title', 'aria-describedby': 'pl-svg-desc' });
  const tip = html('div', 'pl-tip');
  tip.setAttribute('role', 'status');
  tip.hidden = true;
  const empty = html('p', 'pl-empty', 'Pick Race, Gender or Income to compare groups. The list beside the chart shows who each stage counts and where the numbers come from.');
  canvas.append(svg, tip, empty);

  const trace = html('aside', 'trace');
  trace.setAttribute('aria-labelledby', 'pl-log-title');
  const logTitle = html('h3', 'label', 'What each stage counts');
  logTitle.id = 'pl-log-title';
  const log = html('ol', 'tr-log');
  trace.append(logTitle, log);
  body.append(canvas, trace);
  root.append(bar, status, body);

  // ── helpers ──
  const dimension = () => pipeline.dimensions.find((d) => d.id === state.dimension);
  const colorFor = (groupId) => {
    if (state.dimension === 'race') return groupId === state.group ? 'c1' : 'muted';
    const i = COLORED[state.dimension]?.indexOf(groupId);
    return i === 0 ? 'c1' : i === 1 ? 'c2' : 'muted';
  };

  function fillGroups() {
    const d = dimension();
    const highlightable = state.dimension === 'race';
    groupSelect.replaceChildren(...(highlightable ? d.groups : [{ id: '', label: state.dimension === 'all' ? 'Pick a group type first' : 'Both groups shown' }])
      .map((g) => Object.assign(document.createElement('option'), { value: g.id, textContent: g.label })));
    groupSelect.disabled = !highlightable;
    state.group = highlightable ? (DEFAULT_HIGHLIGHT.race) : '';
    groupSelect.value = state.group;
  }

  function renderLegend(series) {
    legend.replaceChildren();
    const item = (cls, text) => {
      const s = html('span');
      s.append(html('i', cls), text);
      legend.append(s);
    };
    for (const s of series) {
      const c = colorFor(s.group.id);
      if (c !== 'muted') item(`k-line k-${c}`, s.group.label);
    }
    if (state.dimension === 'race') item('k-line k-muted', 'Other groups');
    if (series.length) item('k-dash', state.view === 'share' ? 'Share of all high school students' : 'Parity (1.0)');
    item('k-hollow', 'Derived from two sources');
    const anyGap = columns(pipeline).some((c) => state.dimension !== 'all' && columnHasGap(c, state.dimension, state.period));
    badgeSlot.innerHTML = anyGap ? '<span class="badge-ph">Placeholder data</span>' : '';
  }

  // ── drawing ──
  let L;
  function draw({ animate = false } = {}) {
    state.runId++;
    const runId = state.runId;
    hideTip();
    L = layoutFor(canvas.clientWidth || root.clientWidth);
    const series = seriesFor(pipeline, state.dimension, state.period);
    const field = state.view === 'index' ? 'index' : 'value';
    empty.hidden = series.length > 0;
    svg.hidden = series.length === 0;
    renderLegend(series);
    renderLog();
    svg.replaceChildren();
    if (!series.length) return;

    const cols = columns(pipeline);
    const values = series.flatMap((s) => [...s.points.map((p) => p[field]), state.view === 'share' ? s.baseValue : null]);
    const max = niceMax(values, state.view);
    const y = L.yFor(max);
    svg.setAttribute('viewBox', `0 0 ${L.W} ${L.H}`);
    const dimLabel = dimension().label.toLowerCase();
    svg.append(
      svgEl('title', { id: 'pl-svg-title' }, `Representation by ${dimLabel} at each stage`),
      svgEl('desc', { id: 'pl-svg-desc' }, state.view === 'share'
        ? `Each line is a group's share of the people at each stage. Dashed lines mark each group's share of all high school students. The table version below lists every value.`
        : `Each line is a group's share at each stage divided by its share of all high school students. 1.0 is parity. The table version below lists every value.`),
    );

    // grid and axes
    const gGrid = svgEl('g', { class: 'pl-grid', 'aria-hidden': 'true' });
    const step = state.view === 'index' ? (max > 4 ? 1 : 0.5) : max > 70 ? 20 : 10;
    for (let v = 0; v <= max + 1e-9; v += step) {
      gGrid.append(svgEl('line', { x1: L.m.left, x2: L.W - L.m.right, y1: y(v), y2: y(v) }));
      gGrid.append(svgEl('text', { class: 'pl-tick', x: L.m.left - 10, y: y(v) + 4, 'text-anchor': 'end' },
        state.view === 'index' ? `${Number(v.toFixed(1))}×` : `${v}%`));
    }
    cols.forEach((c, i) => {
      gGrid.append(svgEl('line', { class: 'pl-col', x1: L.x(i), x2: L.x(i), y1: L.m.top, y2: L.H - L.m.bottom }));
      gGrid.append(svgEl('text', { class: 'pl-n', x: L.x(i), y: L.H - L.m.bottom + 18, 'text-anchor': 'middle' }, c.n));
      if (!L.narrow) {
        const label = c.has_periods ? `${c.short} · ${state.period}` : c.short;
        gGrid.append(svgEl('text', { class: 'pl-xlabel', x: L.x(i), y: L.H - L.m.bottom + 36, 'text-anchor': 'middle' }, label));
      }
    });
    svg.append(gGrid);

    // reference lines
    const gRef = svgEl('g', { class: 'pl-refs', 'aria-hidden': 'true' });
    if (state.view === 'index') {
      gRef.append(svgEl('line', { class: 'pl-ref pl-ref-parity', x1: L.m.left, x2: L.W - L.m.right, y1: y(1), y2: y(1) }));
      gRef.append(svgEl('text', { class: 'pl-reflabel', x: L.W - L.m.right, y: y(1) - 6, 'text-anchor': 'end' }, 'Parity 1.0'));
    } else {
      for (const s of series) {
        const c = colorFor(s.group.id);
        if (c === 'muted' || s.baseValue === null) continue;
        gRef.append(svgEl('line', { class: `pl-ref pl-${c}`, x1: L.m.left, x2: L.W - L.m.right, y1: y(s.baseValue), y2: y(s.baseValue) }));
      }
    }
    svg.append(gRef);

    // lines and points; muted series first so highlighted ones sit on top
    const ordered = [...series].sort((a, b) => (colorFor(a.group.id) === 'muted' ? -1 : 0) - (colorFor(b.group.id) === 'muted' ? -1 : 0));
    const animations = [];
    for (const s of ordered) {
      const c = colorFor(s.group.id);
      const g = svgEl('g', { class: `pl-series pl-${c}` });
      for (const run of segments(s.points, field)) {
        const d = run.map((p, i) => `${i ? 'L' : 'M'}${L.x(p.col).toFixed(1)},${y(p[field]).toFixed(1)}`).join('');
        const path = svgEl('path', { class: 'pl-line', d, 'aria-hidden': 'true' });
        g.append(path);
        animations.push({ path, start: run[0].col, end: run[run.length - 1].col });
      }
      for (const p of s.points) {
        if (p[field] === null) continue;
        const focusable = c !== 'muted';
        const derived = p.record.derived === true;
        const dot = svgEl('circle', {
          class: `pl-pt${derived ? ' derived' : ''}`, cx: L.x(p.col), cy: y(p[field]), r: c === 'muted' ? 2.6 : 4.5,
          'data-col': p.col,
        });
        if (focusable) {
          dot.setAttribute('tabindex', '0');
          dot.setAttribute('role', 'img');
          dot.setAttribute('aria-label', tipText(s, p).join('. '));
        } else dot.setAttribute('aria-hidden', 'true');
        const show = () => showTip(s, p, dot);
        dot.addEventListener('pointerenter', show);
        dot.addEventListener('focus', show);
        dot.addEventListener('pointerleave', hideTip);
        dot.addEventListener('blur', hideTip);
        dot.addEventListener('click', show);
        g.append(dot);
      }
      svg.append(g);
    }

    if (animate && !reducedMotion()) animateIn(animations, runId);
  }

  // draw each line from left to right; points appear as the line reaches them
  function animateIn(animations, runId) {
    const perCol = 260;
    const total = perCol * (columns(pipeline).length - 1);
    root.setAttribute('aria-busy', 'true');
    svg.querySelectorAll('.pl-pt').forEach((dot) => dot.classList.add('pending'));
    for (const { path, start, end } of animations) {
      const len = path.getTotalLength();
      path.style.strokeDasharray = `${len}`;
      path.style.strokeDashoffset = `${len}`;
      path.getBoundingClientRect();
      path.style.transition = `stroke-dashoffset ${Math.max(1, end - start) * perCol}ms linear ${start * perCol}ms`;
      path.style.strokeDashoffset = '0';
    }
    svg.querySelectorAll('.pl-pt').forEach((dot) => {
      setTimeout(() => { if (runId === state.runId) dot.classList.remove('pending'); }, Number(dot.dataset.col) * perCol);
    });
    setTimeout(() => { if (runId === state.runId) root.removeAttribute('aria-busy'); }, total + 50);
  }

  // ── tooltip ──
  function tipText(s, p) {
    const r = p.record;
    const lines = [`${s.group.label}, ${p.column.short}: ${pct(r.value)} of ${lowerFirst(p.column.population)}`];
    if (p.col > 0 && s.baseValue !== null) lines.push(`Index ${ratio(p.index)} (${pct(s.baseValue)} of all high school students)`);
    lines.push(`Source: ${r.source_short ?? r.source}, ${r.data_year ?? r.year}`);
    if (r.derived) lines.push('Derived from two published figures; see the stage list');
    return lines;
  }
  function showTip(s, p, dot) {
    tip.replaceChildren(...tipText(s, p).map((t, i) => html(i ? 'span' : 'b', null, t)));
    tip.hidden = false;
    const box = canvas.getBoundingClientRect();
    const d = dot.getBoundingClientRect();
    const left = Math.min(Math.max(d.left - box.left - tip.offsetWidth / 2, 4), box.width - tip.offsetWidth - 4);
    const above = d.top - box.top - tip.offsetHeight - 10;
    tip.style.left = `${left}px`;
    tip.style.top = `${above < 0 ? d.bottom - box.top + 10 : above}px`;
  }
  function hideTip() { tip.hidden = true; }
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); });

  // ── stage log ──
  function renderLog() {
    log.replaceChildren();
    for (const column of columns(pipeline)) {
      const li = html('li', 'tr-step');
      li.append(html('span', 'tr-n', column.n));
      const main = html('div', 'tr-main');
      main.append(html('b', null, column.short), html('span', null, column.population));
      main.append(html('span', 'tr-sub', periodNote(column, pipeline, state.dimension)));
      const sources = columnSources(column, state.dimension, state.period);
      if (sources.length) {
        const list = html('ul', 'tr-src');
        for (const r of sources) {
          const item = html('li');
          const a = html('a', null, `${r.source_short ?? r.source}, ${r.data_year ?? r.year}`);
          a.href = r.url; a.target = '_blank'; a.rel = 'noopener';
          item.append(a);
          list.append(item);
        }
        main.append(list);
      }
      if (state.dimension !== 'all' && columnDerived(column, state.dimension, state.period)) {
        main.append(html('span', 'tr-sub', 'Hollow points are derived from more than one published figure. See the table version for the calculation.'));
      }
      if (state.dimension !== 'all' && columnHasGap(column, state.dimension, state.period)) {
        const missing = seriesFor(pipeline, state.dimension, state.period)
          .filter((s) => !isUsable(s.points[columns(pipeline).indexOf(column)].record)).map((s) => s.group.label);
        main.append(html('span', 'badge-ph', 'Placeholder data'));
        main.append(html('span', 'tr-sub', `No verified figure yet for ${missing.join(', ')}. The line has a gap here.`));
      }
      li.append(main);
      log.append(li);
    }
  }

  // ── wiring ──
  dimSet.addEventListener('change', (e) => { state.dimension = e.target.value; fillGroups(); draw(); });
  groupSelect.addEventListener('change', () => { state.group = groupSelect.value; draw(); });
  perSet.addEventListener('change', (e) => { state.period = e.target.value; draw(); });
  viewSet.addEventListener('change', (e) => { state.view = e.target.value; draw(); });
  runBtn.addEventListener('click', () => draw({ animate: true }));
  resetBtn.addEventListener('click', () => {
    state.dimension = 'race'; state.period = 'after'; state.view = 'share';
    for (const [set, v] of [[dimSet, 'race'], [perSet, 'after'], [viewSet, 'share']]) set.querySelector(`input[value="${v}"]`).checked = true;
    fillGroups();
    draw();
  });

  let resizeTimer;
  new ResizeObserver(() => {
    const narrow = (canvas.clientWidth || root.clientWidth) < 640;
    if (L && narrow === L.narrow) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => draw(), 120);
  }).observe(root);

  fillGroups();
  draw();
  return { redraw: () => draw() };
}

// The bundled pipeline.json is the fallback. If the API has newer values for the
// same records, copy them in and redraw.
export function mergeApiRates(byId) {
  let changed = false;
  for (const column of columns(pipeline)) {
    for (const records of Object.values(column.values)) {
      for (const r of records) {
        const d = byId.get(r.id);
        if (!d) continue;
        if (r.verified && isUnsourcedPlaceholder(d)) continue;
        const next = { value: d.value, year: d.year, verified: d.verified, source: d.source?.title ?? r.source, url: d.source?.url ?? r.url };
        for (const [k, v] of Object.entries(next)) {
          if (r[k] !== v) { r[k] = v; changed = true; }
        }
      }
    }
  }
  return changed;
}

const mount = document.getElementById('pipeline-diagram');
if (mount) {
  const widget = mountPipeline(mount);
  loadDatapoints().then((byId) => {
    if (byId && mergeApiRates(byId)) widget.redraw();
  });
}
