// Loads published figures from GET /api/datapoints and updates the charts that
// were already rendered from /data at build time. If the API is missing, slow
// or errors, nothing changes: the build-time /data version stays on the page.
const TIMEOUT_MS = 4000;
let request;

export function loadDatapoints() {
  if (request) return request;
  request = (async () => {
    try {
      const res = await fetch('/api/datapoints', { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'application/json' } });
      if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) return null;
      const body = await res.json();
      if (!Array.isArray(body?.data)) return null;
      const map = new Map(body.data.map((d) => [d.recordId, d]));
      map.all = body.data;
      return map;
    } catch {
      return null;
    }
  })();
  return request;
}

const usable = (d) => d && d.verified === true && typeof d.value === 'number';
export const isUnsourcedPlaceholder = (d) => d?.verified === false && d.year == null && !d.source?.url;
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const badge = '<span class="badge-ph">Placeholder data</span>';
const sourceLabel = (d) => `${esc(d.source?.publisher ?? 'Source')}${d.year ? `, ${esc(d.year)}` : ', year pending'}`;

function hydrateBarChart(figure, byId) {
  const max = Number(figure.dataset.max) || 100;
  const rows = [...figure.querySelectorAll('tr[data-record]')];
  const docs = rows.map((tr) => byId.get(tr.dataset.record));
  if (!docs.some(Boolean)) return;
  // A published build can precede the next database seed.
  if (docs.some((d, i) => d && !usable(d) && !rows[i].classList.contains('is-pending'))) return;
  const showDataYear = figure.hasAttribute('data-show-data-year');
  if (showDataYear && docs.some((d) => !d || isUnsourcedPlaceholder(d))) return;

  rows.forEach((tr, i) => {
    const d = docs[i];
    if (!d) return;
    const track = tr.querySelector('.bc-track');
    const val = tr.querySelector('.bc-val');
    const sub = tr.querySelector('.bc-sub');
    if (sub && showDataYear && d.dataYear) sub.textContent = d.dataYear;
    if (sub && !showDataYear) sub.textContent = `${d.source?.publisher ?? ''}${d.year ? `, ${d.year}` : ''}`;
    if (usable(d)) {
      tr.classList.remove('is-pending');
      track.innerHTML = `<span class="bc-bar" style="width:${((Math.min(Math.max(d.value, 0), max) / max) * 100).toFixed(2)}%"></span>`;
      val.textContent = d.display ?? String(d.value);
    } else {
      tr.classList.add('is-pending');
      track.innerHTML = '<span class="bc-pending">No verified figure yet</span>';
      val.textContent = '—';
    }
  });

  // Rebuild the source line from the records now shown, so source and year stay right.
  const seen = new Map();
  docs.filter(Boolean).forEach((d) => seen.set(`${d.source?.publisher}|${d.year}`, d));
  const parts = [...seen.values()].map((d) => (d.source?.url ? `<a href="${esc(d.source.url)}" rel="noopener" target="_blank">${sourceLabel(d)}</a>` : sourceLabel(d)));
  const pending = docs.some((d) => !usable(d));
  const line = figure.querySelector('.chart-src');
  if (line && parts.length) line.innerHTML = `<span>Source${parts.length > 1 ? 's' : ''}: ${parts.join('; ')}</span>${pending ? ` ${badge}` : ''}`;
}

function hydrateStat(li, d) {
  const v = li.querySelector('.v');
  const v2 = li.querySelector('.v2');
  const src = li.querySelector('.src');
  if (usable(d)) {
    v.textContent = d.display ?? String(d.value);
    if (v2 && d.displaySecondary) v2.textContent = d.displaySecondary;
  } else {
    v.textContent = '—';
  }
  if (src) {
    const label = sourceLabel(d);
    src.innerHTML = `<span>Source: ${d.source?.url ? `<a href="${esc(d.source.url)}" rel="noopener" target="_blank">${label}</a>` : label}</span>${usable(d) ? '' : ` ${badge}`}`;
  }
}

export async function hydrateCharts(root = document) {
  const figures = root.querySelectorAll('.bar-chart[data-max]');
  const stats = root.querySelectorAll('.stat[data-record]');
  if (!figures.length && !stats.length) return false;
  const byId = await loadDatapoints();
  if (!byId) return false;
  figures.forEach((f) => hydrateBarChart(f, byId));
  stats.forEach((li) => {
    const d = byId.get(li.dataset.record);
    if (d) hydrateStat(li, d);
  });
  document.documentElement.dataset.dataSource = 'api';
  return true;
}
