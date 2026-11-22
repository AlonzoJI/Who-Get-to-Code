// Interactive outcomes pipeline: pick a group, press Run, watch 100 students
// move through six stages. Every number comes from /data/pipeline.json via
// model.js; unverified stages remove no one and say so in the log.
import '../styles/pipeline.css';
import pipeline from '../../data/pipeline.json';
import { simulate, groupKey, anyPlaceholder } from './model.js';
import { loadDatapoints } from '../data-client.js';

const NS = 'http://www.w3.org/2000/svg';
const DOT_R = 2.6;
const SPREAD = 4.4; // phyllotaxis spacing for a cluster of dots
const PILE_COLS = 10;
const PILE_GAP = 6;

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

// Deterministic shuffle so a given run always drops the same dots.
function seededShuffle(list, seed) {
  const out = list.slice();
  let s = seed >>> 0 || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function clusterPoint(center, i) {
  if (i === 0) return { x: center.x, y: center.y };
  const r = SPREAD * Math.sqrt(i);
  const a = i * 2.39996; // golden angle in radians
  return { x: center.x + r * Math.cos(a), y: center.y + r * Math.sin(a) };
}

function layoutFor(width) {
  const stages = pipeline.stages.length;
  if (width >= 640) {
    const W = 1000, H = 440, laneY = 160, first = 200, step = (W - first - 70) / (stages - 1);
    return {
      vertical: false, W, H,
      start: { x: 68, y: laneY },
      center: (i) => ({ x: first + i * step, y: laneY }),
      pile: (i) => ({ x: first + i * step - ((PILE_COLS - 1) * PILE_GAP) / 2, y: 292 }),
      label: (i) => ({ x: first + i * step, y: laneY - 84, anchor: 'middle' }),
      count: (i) => ({ x: first + i * step, y: laneY + 76, anchor: 'middle' }),
      pileLabel: (i) => ({ x: first + i * step, y: 292 + 10 * PILE_GAP + 22, anchor: 'middle' }),
    };
  }
  const W = 360, step = 204, top = 268, H = top + (stages - 1) * step + 90;
  return {
    vertical: true, W, H,
    start: { x: 120, y: 76 },
    center: (i) => ({ x: 120, y: top + i * step }),
    pile: (i) => ({ x: 236, y: top + i * step - 27 }),
    label: (i) => ({ x: 20, y: top + i * step - 70, anchor: 'start' }),
    count: (i) => ({ x: 120, y: top + i * step + 70, anchor: 'middle' }),
    pileLabel: (i) => ({ x: 263, y: top + i * step + 50, anchor: 'middle' }),
  };
}

// ── tween engine ──────────────────────────────────────────
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function createAnimator() {
  let active = [];
  let frame = 0;
  const tick = (now) => {
    active = active.filter((tw) => {
      const t = Math.min(1, Math.max(0, (now - tw.start) / tw.dur));
      const k = ease(t);
      tw.dot.x = tw.fx + (tw.tx - tw.fx) * k;
      tw.dot.y = tw.fy + (tw.ty - tw.fy) * k;
      tw.dot.el.setAttribute('cx', tw.dot.x.toFixed(2));
      tw.dot.el.setAttribute('cy', tw.dot.y.toFixed(2));
      if (t >= 1) { tw.done(); return false; }
      return true;
    });
    frame = active.length ? requestAnimationFrame(tick) : 0;
  };
  return {
    move(dots, targets, dur, stagger = 0) {
      if (dur === 0) {
        dots.forEach((d, i) => place(d, targets[i]));
        return Promise.resolve();
      }
      const now = performance.now();
      const all = dots.map((dot, i) => new Promise((done) => {
        active.push({ dot, fx: dot.x, fy: dot.y, tx: targets[i].x, ty: targets[i].y, start: now + i * stagger, dur, done });
      }));
      if (!frame) frame = requestAnimationFrame(tick);
      return Promise.all(all);
    },
    cancel() {
      active.forEach((tw) => tw.done());
      active = [];
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}
function place(dot, p) {
  dot.x = p.x; dot.y = p.y;
  dot.el.setAttribute('cx', p.x.toFixed(2));
  dot.el.setAttribute('cy', p.y.toFixed(2));
}

// ── widget ────────────────────────────────────────────────
export function mountPipeline(root) {
  const state = { dimension: 'all', group: 'all', period: 'after', runId: 0, running: false };
  const animator = createAnimator();
  const periodStages = pipeline.stages.filter((s) => s.has_periods);

  root.replaceChildren();
  root.classList.add('engine');

  // controls
  const bar = html('div', 'eng-bar');
  const dimSet = html('fieldset', 'seg');
  dimSet.append(html('legend', 'label', 'Group by'));
  for (const d of pipeline.dimensions) {
    const id = `pl-dim-${d.id}`;
    const input = Object.assign(document.createElement('input'), { type: 'radio', name: 'pl-dim', id, value: d.id, checked: d.id === state.dimension });
    const lab = html('label', null, d.short);
    lab.htmlFor = id;
    dimSet.append(input, lab);
  }
  const groupWrap = html('label', 'pl-select');
  groupWrap.append(html('span', 'label', 'Group'));
  const groupSelect = document.createElement('select');
  groupWrap.append(groupSelect);

  const perSet = html('fieldset', 'seg');
  perSet.append(html('legend', 'label', 'Period'));
  for (const p of pipeline.periods) {
    const id = `pl-per-${p.id}`;
    const input = Object.assign(document.createElement('input'), { type: 'radio', name: 'pl-per', id, value: p.id, checked: p.id === state.period });
    const lab = html('label', null, p.label.replace(' the rollback', ''));
    lab.htmlFor = id;
    perSet.append(input, lab);
  }
  const perNote = html('span', 'pl-note',
    periodStages.length
      ? `Applies to stage ${periodStages.map((s) => s.n).join(', ')} only`
      : 'No stage has before and after data yet');
  perNote.id = 'pl-per-note';
  perSet.setAttribute('aria-describedby', perNote.id);

  const runBtn = html('button', 'btn primary sm', `Run ${pipeline.cohort_size} students`);
  runBtn.type = 'button';
  const resetBtn = html('button', 'btn text sm', 'Reset');
  resetBtn.type = 'button';
  const actions = html('div', 'pl-actions');
  actions.append(runBtn, resetBtn);

  const controls = html('div', 'pl-controls');
  const perGroup = html('div', 'pl-pergroup');
  perGroup.append(perSet, perNote);
  controls.append(dimSet, groupWrap, perGroup);
  bar.append(controls, actions);

  const status = html('div', 'pl-status');
  const legend = html('div', 'pl-legend');
  legend.innerHTML = '<span><i class="k-in"></i>Still in the pipeline</span><span><i class="k-out"></i>Dropped off</span>';
  const badgeSlot = html('span');
  status.append(legend, badgeSlot);

  // stage + log
  const body = html('div', 'eng-body');
  const canvas = html('div', 'eng-canvas');
  const svg = svgEl('svg', { role: 'img', 'aria-labelledby': 'pl-svg-title pl-svg-desc' });
  canvas.append(svg);
  const trace = html('aside', 'trace');
  trace.setAttribute('aria-label', 'Path taken');
  trace.append(html('h3', 'label', 'Path taken'));
  const log = html('ol', 'tr-log');
  log.setAttribute('aria-live', 'polite');
  trace.append(log);
  body.append(canvas, trace);

  root.append(bar, status, body);

  // ── drawing ──
  let L, dots, pileCounts, countText, pileText, rings;

  function draw() {
    L = layoutFor(canvas.clientWidth || root.clientWidth);
    svg.setAttribute('viewBox', `0 0 ${L.W} ${L.H}`);
    svg.classList.toggle('vertical', L.vertical);
    svg.replaceChildren(
      svgEl('title', { id: 'pl-svg-title' }, 'Outcomes pipeline diagram'),
      svgEl('desc', { id: 'pl-svg-desc' }, `${pipeline.cohort_size} students move through six stages. The Path taken log lists what happens at each stage.`)
    );
    const gEdges = svgEl('g'), gNodes = svgEl('g'), gText = svgEl('g'), gDots = svgEl('g');
    svg.append(gEdges, gNodes, gText, gDots);

    const centers = [L.start, ...pipeline.stages.map((_, i) => L.center(i))];
    for (let i = 0; i < centers.length - 1; i++) {
      gEdges.append(svgEl('line', { class: 'pl-edge', x1: centers[i].x, y1: centers[i].y, x2: centers[i + 1].x, y2: centers[i + 1].y }));
    }
    rings = centers.map((c) => {
      const r = svgEl('circle', { class: 'pl-ring', cx: c.x, cy: c.y, r: 52 });
      gNodes.append(r);
      return r;
    });

    const startLabel = L.vertical ? { x: 20, y: L.start.y - 46, anchor: 'start' } : { x: L.start.x, y: L.start.y - 84, anchor: 'middle' };
    gText.append(svgEl('text', { class: 'pl-n', x: startLabel.x, y: startLabel.y - 16, 'text-anchor': startLabel.anchor }, '00'));
    gText.append(svgEl('text', { class: 'pl-title', x: startLabel.x, y: startLabel.y, 'text-anchor': startLabel.anchor }, 'Cohort'));
    gText.append(svgEl('text', { class: 'pl-count', x: L.start.x, y: L.start.y + 76, 'text-anchor': 'middle' }, `${pipeline.cohort_size} students`));

    countText = []; pileText = [];
    pipeline.stages.forEach((s, i) => {
      const lp = L.label(i), cp = L.count(i), pp = L.pileLabel(i);
      gText.append(svgEl('text', { class: 'pl-n', x: lp.x, y: lp.y - 16, 'text-anchor': lp.anchor }, s.n));
      gText.append(svgEl('text', { class: 'pl-title', x: lp.x, y: lp.y, 'text-anchor': lp.anchor }, s.short));
      const ct = svgEl('text', { class: 'pl-count', x: cp.x, y: cp.y, 'text-anchor': cp.anchor }, '');
      const pt = svgEl('text', { class: 'pl-drop', x: pp.x, y: pp.y, 'text-anchor': pp.anchor }, '');
      gText.append(ct, pt);
      countText.push(ct); pileText.push(pt);
    });

    dots = Array.from({ length: pipeline.cohort_size }, (_, i) => {
      const el = svgEl('circle', { class: 'pl-dot', r: DOT_R });
      gDots.append(el);
      const d = { el, x: 0, y: 0, i };
      place(d, clusterPoint(L.start, i));
      return d;
    });
    pileCounts = pipeline.stages.map(() => 0);
  }

  // ── controls wiring ──
  function fillGroups() {
    const dim = pipeline.dimensions.find((d) => d.id === state.dimension);
    groupSelect.replaceChildren(...dim.groups.map((g) => Object.assign(document.createElement('option'), { value: g.id, textContent: g.label })));
    state.group = dim.groups[0].id;
    groupSelect.disabled = dim.groups.length < 2;
  }

  function currentSteps() {
    return simulate(pipeline, groupKey(state.dimension, state.group), state.period);
  }

  function refreshBadge() {
    badgeSlot.innerHTML = anyPlaceholder(currentSteps()) ? '<span class="badge-ph">Placeholder data</span>' : '';
  }

  function reset() {
    state.runId++;
    animator.cancel();
    state.running = false;
    root.removeAttribute('aria-busy');
    log.replaceChildren(html('li', 'tr-empty', 'Pick a group and press Run.'));
    draw();
    refreshBadge();
  }

  dimSet.addEventListener('change', (e) => { state.dimension = e.target.value; fillGroups(); reset(); });
  groupSelect.addEventListener('change', () => { state.group = groupSelect.value; reset(); });
  perSet.addEventListener('change', (e) => { state.period = e.target.value; reset(); });
  resetBtn.addEventListener('click', reset);
  runBtn.addEventListener('click', run);

  let resizeTimer;
  new ResizeObserver(() => {
    const vertical = (canvas.clientWidth || root.clientWidth) < 640;
    if (L && vertical === L.vertical) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(reset, 120);
  }).observe(root);

  // ── run ──
  function logStep(step) {
    const { stage, record, usable } = step;
    const li = html('li', 'tr-step');
    li.append(html('span', 'tr-n', stage.n));
    const main = html('div', 'tr-main');
    main.append(html('b', null, stage.short));
    if (usable) {
      main.append(html('span', null, `${step.entered} in · ${step.dropped} dropped off · ${step.reached} continue`));
      const kinds = record.by_kind && Object.entries(record.by_kind).filter(([, v]) => typeof v === 'number');
      if (kinds?.length) main.append(html('span', 'tr-sub', kinds.map(([k, v]) => `${k.replaceAll('_', ' ')} ${v}%`).join(' · ')));
      if (typeof record.median_earnings_usd === 'number') main.append(html('span', 'tr-sub', `Median earnings $${record.median_earnings_usd.toLocaleString('en-US')}`));
      const src = html('span', 'tr-src');
      const a = html('a', null, `${record.source}, ${record.year}`);
      a.href = record.url; a.target = '_blank'; a.rel = 'noopener';
      src.append('Source: ', a);
      main.append(src);
    } else {
      main.append(html('span', null, `${step.entered} in · data pending, no one removed`));
      const ph = html('span', 'badge-ph', 'Placeholder data');
      main.append(ph);
    }
    if (stage.has_periods) main.append(html('span', 'tr-sub', pipeline.periods.find((p) => p.id === state.period).label));
    li.append(main);
    log.append(li);
    trace.scrollTop = trace.scrollHeight;
  }

  async function run() {
    reset();
    const id = state.runId;
    const live = () => id === state.runId;
    const slow = reducedMotion() ? 0 : 1;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms * slow));
    state.running = true;
    root.setAttribute('aria-busy', 'true');
    log.replaceChildren();

    const steps = currentSteps();
    let alive = dots.slice();
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      rings.forEach((r, k) => r.classList.toggle('on', k === i + 1));
      await animator.move(alive, alive.map((_, j) => clusterPoint(L.center(i), j)), 720 * slow, 3 * slow);
      if (!live()) return;
      countText[i].textContent = step.usable ? `${step.entered} → ${step.reached}` : `${step.entered} → pending`;
      await wait(220);
      if (!live()) return;
      if (step.dropped > 0) {
        const shuffled = seededShuffle(alive, (i + 1) * 7919);
        const leaving = shuffled.slice(0, step.dropped);
        alive = shuffled.slice(step.dropped);
        leaving.forEach((d) => d.el.classList.add('out'));
        const p0 = L.pile(i);
        const targets = leaving.map((_, j) => {
          const n = pileCounts[i]++;
          return { x: p0.x + (n % PILE_COLS) * PILE_GAP, y: p0.y + Math.floor(n / PILE_COLS) * PILE_GAP };
        });
        await animator.move(leaving, targets, 620 * slow, 5 * slow);
        if (!live()) return;
        pileText[i].textContent = `−${step.dropped}`;
      }
      logStep(step);
      await wait(180);
      if (!live()) return;
    }
    rings.forEach((r) => r.classList.remove('on'));
    const last = steps[steps.length - 1];
    const allPending = steps.every((s) => !s.usable);
    log.append(html('li', 'tr-end', allPending
      ? `All ${pipeline.cohort_size} passed through because no stage has verified data yet.`
      : `${last.reached} of ${pipeline.cohort_size} reached stage ${last.stage.n}.`));
    state.running = false;
    root.removeAttribute('aria-busy');
  }

  fillGroups();
  reset();
  return { reset, isRunning: () => state.running };
}

// The bundled pipeline.json is the fallback. If the API has newer stage rates,
// copy them in and redraw (unless a run is in progress).
export function mergeApiRates(byId) {
  let changed = false;
  for (const stage of pipeline.stages) {
    for (const records of Object.values(stage.values)) {
      for (const r of records) {
        const d = byId.get(r.id);
        if (!d) continue;
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
    if (byId && mergeApiRates(byId) && !widget.isRunning()) widget.reset();
  });
}
