// STEM outreach directory: loads approved listings from /api/outreach, filters
// them in the browser and draws the self-reported funding chart.
// All visitor-supplied text goes in with textContent, never innerHTML.
import '../styles/outreach.css';
import {
  COST_FILTERS, COSTS, FORMATS, GRADE_BANDS, NATIONWIDE, REGIONS, labelFor, matchesFilters,
} from '../../lib/outreach-options.js';

const FILTERS = { state: REGIONS, grade: GRADE_BANDS, format: FORMATS, cost: COST_FILTERS };

const form = document.getElementById('od-filters');
const list = document.getElementById('od-cards');
const count = document.getElementById('od-count');
const funding = document.getElementById('od-funding');

// el('p', { class: 'x' }, 'text', child) builds an element; strings become text nodes.
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.flat().filter((c) => c != null && c !== false));
  return node;
}

// ── filters ────────────────────────────────────────────────
for (const [name, options] of Object.entries(FILTERS)) {
  const select = form.elements[name];
  select.append(...options.map((o) => el('option', { value: o.id }, o.label)));
}

const readFilters = () =>
  Object.fromEntries(['q', ...Object.keys(FILTERS)].map((name) => [name, form.elements[name].value.trim()]).filter(([, v]) => v));

// Filters live in the URL, so a teacher can send a colleague a filtered link.
function restoreFilters() {
  const params = new URLSearchParams(location.search);
  for (const name of ['q', ...Object.keys(FILTERS)]) {
    const value = params.get(name);
    const control = form.elements[name];
    if (value && (control.tagName !== 'SELECT' || [...control.options].some((o) => o.value === value))) control.value = value;
  }
}

function saveFilters(filters) {
  const url = new URL(location.href);
  url.search = new URLSearchParams(filters).toString();
  history.replaceState(null, '', url);
}

// ── cards ──────────────────────────────────────────────────
const where = (p) => {
  if (p.state === NATIONWIDE) return p.city ? `${p.city} and nationwide online` : 'Nationwide, online';
  return [p.city, labelFor(REGIONS, p.state)].filter(Boolean).join(', ');
};

function card(p) {
  const tags = [
    ...p.gradeBands.map((g) => labelFor(GRADE_BANDS, g)),
    ...p.formats.map((f) => labelFor(FORMATS, f)),
    labelFor(COSTS, p.cost),
    p.scholarships ? 'Scholarships available' : null,
  ].filter(Boolean);
  return el(
    'li',
    { class: 'cell od-card' },
    el('p', { class: 'od-org' }, p.organization),
    el('h3', {}, p.programName),
    el('p', { class: 'od-where' }, where(p)),
    el('p', { class: 'od-aud' }, p.audience),
    el('ul', { class: 'od-tags', 'aria-label': 'Grade, format and cost' }, tags.map((t) => el('li', { class: 'pill' }, t))),
    el('div', { class: 'od-connect' }, el('p', { class: 'od-label' }, 'How to connect students'), el('p', {}, p.howToConnect)),
    el(
      'div',
      { class: 'card-foot' },
      el(
        'a',
        // The server only accepts http(s) addresses; checked again here so a bad record can't become a script link.
        { class: 'btn text', href: /^https?:\/\//i.test(p.website) ? p.website : null, target: '_blank', rel: 'noopener noreferrer' },
        'Visit website',
        el('span', { class: 'visually-hidden' }, ` for ${p.programName} (opens in a new tab)`),
        el('span', { class: 'arr', 'aria-hidden': 'true' }, ' ↗')
      ),
      el('span', { class: 'od-self' }, 'Listed by the program')
    )
  );
}

let listings = [];

function render() {
  const filters = readFilters();
  saveFilters(filters);
  const shown = listings.filter((p) => matchesFilters(p, filters));
  list.replaceChildren(...shown.map(card));
  if (!listings.length) {
    count.textContent = 'No programs are listed yet. If you run one, you can add it below.';
  } else if (!shown.length) {
    count.textContent = `No programs match these filters. Try a wider search or clear the filters (${listings.length} listed in all).`;
  } else {
    count.textContent = `Showing ${shown.length} of ${listings.length} listed program${listings.length === 1 ? '' : 's'}.`;
  }
}

form.addEventListener('input', render);
form.addEventListener('submit', (e) => e.preventDefault());
form.addEventListener('reset', () => setTimeout(render));

// ── funding chart ──────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const longDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};
const badge = (text) => el('span', { class: 'badge-ph' }, text);

function fundingChart(summary) {
  const title = 'Listed programs reporting funding or partnership changes since 2025';
  const anyShown = summary && summary.rows.some((r) => !r.suppressed);
  const total = summary?.total ?? 0;
  const rows = (summary?.rows ?? []).map((r) => {
    const shown = !r.suppressed;
    const pct = shown && total ? ((r.count / total) * 100).toFixed(2) : 0;
    return el(
      'tr',
      { class: shown ? '' : 'is-pending' },
      el('th', { scope: 'row' }, r.label, el('span', { class: 'bc-sub' }, 'Self-reported')),
      el(
        'td',
        {},
        el('span', { class: 'bc-track' }, shown ? el('span', { class: 'bc-bar', style: `width:${pct}%` }) : el('span', { class: 'bc-pending' }, 'Fewer than 10, hidden')),
        el('span', { class: 'bc-val' }, shown ? `${r.count} of ${total}` : '—')
      )
    );
  });

  const note = !summary
    ? 'The chart could not load right now.'
    : !anyShown
      ? total
        ? 'Not enough listings yet. Each total stays hidden until it reaches 10.'
        : 'No listings yet. Each total stays hidden until it reaches 10.'
      : null;

  const source = el(
    'p',
    { class: 'chart-src' },
    el(
      'span',
      {},
      'Source: self-reported by program leaders through this directory’s form, approved listings',
      summary?.asOf ? ` as of ${longDate(summary.asOf)}` : '',
      '. Not independently verified.'
    ),
    anyShown ? badge('Self-reported, unverified') : badge('Placeholder data')
  );

  return el(
    'figure',
    { class: 'bar-chart is-count od-chart' },
    el('figcaption', {}, el('h3', { class: 'bc-title', id: 'od-chart-title' }, title), el('p', { class: 'bc-measure' }, 'Number of approved listings, by answer')),
    rows.length
      ? el(
          'table',
          { class: 'bc', style: '--grid-step:25%', 'aria-labelledby': 'od-chart-title' },
          el('thead', { class: 'visually-hidden' }, el('tr', {}, el('th', { scope: 'col' }, 'Answer'), el('th', { scope: 'col' }, 'Listings'))),
          el('tbody', {}, rows)
        )
      : null,
    note ? el('p', { class: 'bc-note' }, note) : null,
    source
  );
}

// ── load ───────────────────────────────────────────────────
restoreFilters();
try {
  const res = await fetch('api/outreach', { headers: { Accept: 'application/json' } });
  if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  listings = body.data;
  render();
  funding.replaceChildren(fundingChart(body.funding));
} catch (err) {
  console.warn('Outreach directory could not load:', err.message);
  count.textContent = 'The directory could not load right now. Please try again later.';
  funding.replaceChildren(fundingChart(null));
}
