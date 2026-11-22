// "From the classroom": charts and quote cards from APPROVED educator
// responses, read from GET /api/submissions/educator. The API has already
// hidden every count under 10; this file only draws what it was given.
import '../styles/classroom.css';

const ENDPOINT = '/api/submissions/educator';

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

const yearText = (years) => (!years ? 'year pending' : years[0] === years[1] ? String(years[0]) : `${years[0]} to ${years[1]}`);

// Same markup as the build-time bar charts (lib/render.js barChart), so the
// table stays readable for screen readers.
function barChart(chart, summary) {
  const figure = el('figure', 'bar-chart is-count');
  figure.id = `chart-${chart.id}`;
  const caption = el('figcaption');
  const title = el('h3', 'bc-title', chart.title);
  title.id = `chart-${chart.id}-title`;
  caption.append(title, el('p', 'bc-measure', `${chart.measure} Bars show the share of ${summary.total} approved responses.`));

  const table = el('table', 'bc');
  table.style.setProperty('--grid-step', '25%');
  table.setAttribute('aria-labelledby', title.id);
  const head = el('thead', 'visually-hidden');
  const hr = el('tr');
  hr.append(Object.assign(el('th', null, 'Answer'), { scope: 'col' }), Object.assign(el('th', null, 'Responses'), { scope: 'col' }));
  head.append(hr);
  const tbody = el('tbody');
  for (const row of chart.rows) {
    const tr = el('tr', row.count == null ? 'is-suppressed' : '');
    const th = Object.assign(el('th', null, row.label), { scope: 'row' });
    const td = el('td');
    const track = el('span', 'bc-track');
    if (row.count == null) {
      track.append(el('span', 'bc-pending', `Fewer than ${summary.minCount}, not shown`));
    } else {
      const fill = el('span', 'bc-bar');
      fill.style.width = `${((row.count / summary.total) * 100).toFixed(2)}%`;
      track.append(fill);
    }
    td.append(track, el('span', 'bc-val', row.count == null ? '' : `${row.count} of ${summary.total}`));
    tr.append(th, td);
    tbody.append(tr);
  }
  table.append(head, tbody);

  const axis = el('div', 'bc-axis');
  axis.setAttribute('aria-hidden', 'true');
  const ticks = el('span', 'bc-ticks');
  for (const t of [0, 25, 50, 75, 100]) {
    const i = el('i', null, `${t}%`);
    i.style.left = `${t}%`;
    ticks.append(i);
  }
  axis.append(el('span'), ticks);

  const src = el('p', 'chart-src');
  const link = el('a', null, 'Educator responses to this site');
  link.href = 'share.html';
  src.append(el('span'));
  src.firstChild.append('Source: ', link, `, ${yearText(summary.years)}. ${summary.label}.`);
  figure.append(caption, table, axis, src);
  return figure;
}

function quoteCard(q) {
  const li = el('li', 'cell');
  const fig = el('figure', 'cr-quote');
  const quote = el('blockquote');
  for (const para of q.text.split(/\n{2,}/)) quote.append(el('p', null, para));
  const cap = el('figcaption');
  const who = [q.name, q.school].filter(Boolean).join(', ');
  if (who) cap.append(el('b', null, who));
  const where = [q.role, q.gradeBands.length ? `grades ${q.gradeBands.join(', ')}` : null, q.state].filter(Boolean).join(' · ');
  cap.append(where);
  fig.append(quote, cap);
  li.append(fig);
  return li;
}

export async function mountResults({ status, charts, quotes }) {
  let summary;
  try {
    const res = await fetch(ENDPOINT, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (res.ok) summary = await res.json();
  } catch {
    summary = null;
  }

  if (!summary) {
    status.replaceChildren(el('span', null, 'Responses could not be loaded right now. Please try again later.'));
    charts.replaceChildren();
    quotes.replaceChildren(el('p', 'cr-empty', 'Quotes could not be loaded right now.'));
    return;
  }

  if (summary.enough) {
    status.replaceChildren(el("span", "v", String(summary.total)), ` approved responses from educators, ${yearText(summary.years)}.`);
    charts.replaceChildren(...summary.charts.map((c) => barChart(c, summary)));
  } else {
    status.replaceChildren(
      el('span', null, `Fewer than ${summary.minCount} responses have been approved so far. Charts appear once there are at least ${summary.minCount}, so no single school can be picked out.`)
    );
    charts.replaceChildren();
    charts.hidden = true;
  }

  if (summary.quotes.length) {
    const list = el('ul', 'grid g3 cr-quotes');
    list.setAttribute('aria-label', 'Quotes from educators');
    list.append(...summary.quotes.map(quoteCard));
    quotes.replaceChildren(list);
  } else {
    quotes.replaceChildren(el('p', 'cr-empty', 'No quotes have been selected yet. Quotes appear only from approved responses whose authors agreed to publication.'));
  }
}

const status = document.getElementById('cr-status');
if (status) {
  mountResults({ status, charts: document.getElementById('cr-charts'), quotes: document.getElementById('cr-quotes') });
}
