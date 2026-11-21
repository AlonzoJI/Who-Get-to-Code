// Cascade explainer: an illustrative group of students sorted into three tiers
// of college selectivity. Run moves some students from the top tier down.
// The dots are NOT data; tier definitions come from data/college.json.
import '../styles/cascade.css';
import college from '../../data/college.json';

const { tiers, illustrative_note: note } = college.cascade;

// Illustrative layout only: how many dots start in each tier, and which top-tier
// dots move (and to which tier) when the cascade runs. Not counts from a source.
const START = [12, 16, 20];
const MOVES = [
  { from: 0, to: 1 }, { from: 0, to: 1 }, { from: 0, to: 1 }, { from: 0, to: 2 },
];
const DOT = 10;
const GAP = 6;

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

function mountCascade(root) {
  root.replaceChildren();
  root.classList.add('cx');

  const bar = el('div', 'cx-bar');
  const legend = el('div', 'cx-legend');
  legend.innerHTML = '<span><i class="k-stay"></i>Student</span><span><i class="k-move"></i>Student who lands one or more tiers lower</span>';
  const run = el('button', 'btn primary sm', 'Run the cascade');
  run.type = 'button';
  const tag = el('span', 'badge-illus', 'Illustrative, not data');
  bar.append(legend, tag, run);

  const stage = el('div', 'cx-stage');
  const pools = tiers.map((t) => {
    const row = el('div', 'cx-tier');
    const label = el('div', 'cx-label');
    label.append(el('b', null, t.label), el('span', null, t.rule));
    const pool = el('div', 'cx-pool');
    row.append(label, pool);
    stage.append(row);
    return pool;
  });
  const layer = el('div', 'cx-layer');
  layer.setAttribute('aria-hidden', 'true');
  stage.append(layer);

  const outcome = el('div', 'cx-axis');
  outcome.setAttribute('aria-hidden', 'true');
  outcome.append(el('span', null, 'Higher graduation rates and earnings'), el('span', null, 'Lower'));
  stage.append(outcome);

  const status = el('p', 'cx-status');
  status.setAttribute('aria-live', 'polite');
  const foot = el('p', 'chart-src cx-note', note);

  root.append(bar, stage, status, foot);

  // dots: tier index per dot, plus whether it moves
  const dots = [];
  START.forEach((n, tier) => {
    for (let i = 0; i < n; i++) dots.push({ tier, home: tier, el: layer.appendChild(el('span', 'cx-dot')) });
  });
  // the movers are spread through the top tier, not the first few in a row
  const topDots = dots.filter((d) => d.home === 0);
  MOVES.forEach((m, i) => {
    const d = topDots[Math.round(((i + 0.5) * topDots.length) / MOVES.length)] ?? topDots[i];
    d.moveTo = m.to;
  });

  let after = false;

  function place(animate) {
    const stageBox = stage.getBoundingClientRect();
    const slots = tiers.map(() => 0);
    for (const d of dots) {
      d.tier = after && d.moveTo != null ? d.moveTo : d.home;
    }
    const counts = tiers.map((_, t) => dots.filter((d) => d.tier === t).length);
    // stable order inside each tier: residents first, arrivals at the end
    const ordered = [...dots].sort((a, b) => (a.tier - b.tier) || ((a.tier !== a.home) - (b.tier !== b.home)));
    for (const d of ordered) {
      const box = pools[d.tier].getBoundingClientRect();
      const cols = Math.max(1, Math.floor((box.width - 8) / (DOT + GAP)));
      const i = slots[d.tier]++;
      const x = box.left - stageBox.left + 8 + (i % cols) * (DOT + GAP);
      const y = box.top - stageBox.top + (box.height - DOT) / 2 + (Math.floor(i / cols) - 0.5 * (Math.ceil(counts[d.tier] / cols) - 1)) * (DOT + GAP);
      d.el.style.transition = animate ? '' : 'none';
      d.el.style.transitionDelay = animate && d.moveTo != null ? `${dots.indexOf(d) % 4 * 90}ms` : '0ms';
      d.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      d.el.classList.toggle('is-move', after && d.moveTo != null);
    }
  }

  function setStatus() {
    status.textContent = after
      ? `After the ruling: some students who would have enrolled at a highly selective college land at a selective or less selective one instead.`
      : 'Before the ruling: an illustrative group of students, sorted by the kind of college they enroll in. Press Run the cascade to see the shift.';
  }

  run.addEventListener('click', () => {
    after = !after;
    run.textContent = after ? 'Reset' : 'Run the cascade';
    place(true);
    setStatus();
  });

  let t;
  new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => place(false), 60); }).observe(stage);
  place(false);
  setStatus();
}

const mount = document.getElementById('cascade-widget');
if (mount) mountCascade(mount);
