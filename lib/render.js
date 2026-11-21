// Build-time HTML renderers. Pages contain markers like <!-- @stats home-stats -->
// and the Vite plugin in vite.config.js swaps them for the output of these
// functions, reading /data fresh on every request. The site works without JS.

export const esc = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

export const placeholderBadge = () => '<span class="badge-ph">Placeholder data</span>';

// One record in, one stat tile out. A record that is not verified, or has no
// value yet, always carries the placeholder badge.
export function statTile(record) {
  const unverified = record.verified !== true || record.value == null;
  const display = record.value == null ? '—' : record.display;
  return `
      <li class="cell stat" data-record="${esc(record.id)}">
        <p class="v">${esc(display)}</p>
        ${record.display_secondary ? `<p class="v2">${esc(record.display_secondary)}</p>` : ''}
        <p class="cap">${esc(record.caption)}</p>
        <p class="src">
          <span>Source: <a href="${esc(record.url)}" rel="noopener" target="_blank">${esc(record.source_short)}, ${esc(record.year)}</a></span>
          ${unverified ? placeholderBadge() : ''}
        </p>
      </li>`;
}

export function statGrid(records, label) {
  return `<ul class="grid g3" aria-label="${esc(label)}">${records.map(statTile).join('')}
    </ul>`;
}

// Methods + full citations for a set of records, for a "technical version" block.
export function citationList(records) {
  return `<ol>${records
    .map(
      (r) => `
        <li><b>${esc(r.display)}${r.display_secondary ? `, ${esc(r.display_secondary)}` : ''}.</b>
          ${esc(r.source)}. ${esc(r.data_year)}.
          <a href="${esc(r.url)}" rel="noopener" target="_blank">Source</a>${
            r.url_study ? `, <a href="${esc(r.url_study)}" rel="noopener" target="_blank">underlying study</a>` : ''
          }. Accessed ${esc(r.accessed)}.
          <br>${esc(r.notes)}</li>`
    )
    .join('')}</ol>`;
}

export function pipelineCards(pages) {
  return `<ol class="grid g3" aria-label="The six stages of the pipeline">${pages
    .map(
      (p) => `
      <li class="cell card-n has-link">
        <a class="cell-link card-body" href="${esc(p.file)}">
          <span class="n" aria-hidden="true">${esc(p.n)}</span>
          <h3><span class="visually-hidden">Stage ${Number(p.n)}: </span>${esc(p.title)}</h3>
          <p>${esc(p.question)}</p>
          <span class="card-foot"><span class="pill">Coming soon</span><span class="btn text sm" aria-hidden="true">Open <span class="arr">→</span></span></span>
        </a>
      </li>`
    )
    .join('')}
    </ol>`;
}

export function fromClassCard(reading) {
  if (!reading) {
    return `<aside class="fromclass" aria-label="From class">
      <div class="bar"><span>From class</span><span class="course">ESPHE 3206</span></div>
      <div class="body"><div class="ph-copy"><span class="tag">Placeholder</span><p>Course reading pairing goes here.</p></div></div>
    </aside>`;
  }
  const works = reading.works
    .map((w) =>
      w.url
        ? `<li><a href="${esc(w.url)}" rel="noopener" target="_blank">${esc(w.cite)}</a></li>`
        : `<li>${esc(w.cite)}</li>`
    )
    .join('');
  return `<aside class="fromclass" aria-label="From class: ${esc(reading.heading)}">
      <div class="bar"><span>From class</span><span class="course">ESPHE 3206</span></div>
      <div class="body">
        <div class="cite">
          <h3>${esc(reading.heading)}</h3>
          <p class="idea">${esc(reading.idea)}</p>
          <ul class="works">${works}</ul>
        </div>
        <div class="tie">${reading.tie.map((t) => `<p>${esc(t)}</p>`).join('')}${
          reading.placeholder
            ? `<div class="ph-copy"><span class="tag">Placeholder</span><p>${esc(reading.placeholder)}</p></div>`
            : ''
        }</div>
      </div>
    </aside>`;
}

// Every record in pipeline.json, across stages and periods.
const pipelineRecords = (pipeline) =>
  pipeline.stages.flatMap((s) => Object.values(s.values).flat());

// The source line that sits directly under the pipeline diagram.
export function pipelineSource(pipeline) {
  const records = pipelineRecords(pipeline);
  const verified = records.filter((r) => r.verified === true && typeof r.value === 'number');
  const years = [...new Set(verified.map((r) => r.year))].sort();
  return `<p class="chart-src">Source: datasets listed by stage below${
    years.length ? `, ${esc(years.join(', '))}` : ''
  }. ${verified.length} of ${records.length} figures verified.${
    verified.length < records.length ? ` ${placeholderBadge()}` : ''
  }</p>`;
}

export function datasetsByStage(pipeline) {
  return `<ul class="ds-list" aria-label="Datasets for each stage">${pipeline.stages
    .map(
      (s) => `
      <li class="ds-row">
        <span class="ds-stage"><span class="n">${esc(s.n)}</span><b>${esc(s.short)}</b></span>
        <p class="ds-metric">${esc(s.metric)}${s.has_periods ? '. Compared before and after the rollback.' : '.'}</p>
        <ul class="ds-sets">${s.datasets
          .map((id) => pipeline.datasets[id])
          .map((d) => `<li><a href="${esc(d.url)}" rel="noopener" target="_blank">${esc(d.name)}</a><span class="pub">${esc(d.publisher)}</span></li>`)
          .join('')}</ul>
      </li>`
    )
    .join('')}
    </ul>`;
}

// ── rollback timeline ───────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (iso) => {
  const [y, m] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

// Add ", year" only when the citation doesn't already contain it.
const withYear = (source) => (String(source.cite).includes(String(source.year)) ? '' : `, ${esc(source.year)}`);

function link(source, text) {
  return `<a href="${esc(source.url)}" rel="noopener" target="_blank">${esc(text ?? source.cite)}</a>`;
}

function eventCard(ev, arenaLabel, stageInfo) {
  const s = ev.supporters;
  const o = ev.outcome;
  const supporterBody = s.quote
    ? `<blockquote><p>${s.lead ? `${esc(s.lead)} ` : ''}“${esc(s.quote)}”</p></blockquote>`
    : '';
  return `
    <article class="ev-card" id="ev-${esc(ev.id)}" aria-labelledby="ev-${esc(ev.id)}-title" tabindex="-1">
      <header class="ev-head">
        <span class="eyebrow">${esc(ev.date_label)} · ${esc(arenaLabel)}${ev.kind === 'outcome' ? ' · Outcome' : ''}</span>
        <h2 id="ev-${esc(ev.id)}-title">${esc(ev.title)}</h2>
      </header>
      <div class="ev-grid">
        <section class="ev-sec">
          <h3 class="label">What happened</h3>
          ${ev.happened.map((p) => `<p>${esc(p)}</p>`).join('')}
        </section>
        <section class="ev-sec">
          <h3 class="label">Who it affects in the CS pipeline</h3>
          <ul class="ev-stages">${ev.stages
            .map((n) => stageInfo[n])
            .map((st) => `<li><a class="pill" href="${esc(st.file)}">${esc(st.n)} ${esc(st.short)}</a></li>`)
            .join('')}</ul>
          <p>${esc(ev.affects)}</p>
        </section>
      </div>
      <div class="ev-debate">
        <section class="ev-side">
          <h3 class="label">What supporters of the change argue</h3>
          ${supporterBody}
          <p class="ev-who">${esc(s.who)}</p>
          ${s.extra ? `<p>${esc(s.extra)}</p>` : ''}
          <p class="chart-src"><span>Source: ${link(s.source)}${withYear(s.source)}</span></p>
        </section>
        <section class="ev-side">
          <h3 class="label">${esc(o.label ?? 'What the outcome data shows')}</h3>
          <p>${esc(o.text)}</p>
          <p class="chart-src"><span>${o.source ? `Source: ${link(o.source)}${withYear(o.source)}` : 'Source: pending'}</span>${
            o.verified ? '' : ` ${placeholderBadge()}`
          }</p>
        </section>
      </div>
      <section class="ev-sources">
        <h3 class="label">Sources</h3>
        <ol>${ev.sources
          .map((src) => `<li>${link(src)}. ${esc(src.publisher)}${withYear(src)}.</li>`)
          .join('')}</ol>
      </section>
      ${ev.notes ? `<details class="more"><summary>The technical version</summary><div class="more-in"><p>${esc(ev.notes)}</p></div></details>` : ''}
    </article>`;
}

export function rollbackTimeline(data, pipeline) {
  const start = Date.parse(data.axis.start);
  const end = Date.parse(data.axis.end);
  const pct = (iso) => (((Date.parse(iso) - start) / (end - start)) * 100).toFixed(3);
  const arenaLabel = Object.fromEntries(data.arenas.map((a) => [a.id, a.label]));
  const stageInfo = Object.fromEntries(pipeline.stages.map((s) => [Number(s.n), s]));
  const events = [...data.events].sort((a, b) => a.date.localeCompare(b.date));
  const years = [];
  for (let y = new Date(start).getUTCFullYear(); y <= new Date(end).getUTCFullYear(); y++) years.push(y);
  const today = new Date().toISOString().slice(0, 10);
  const todayInRange = Date.parse(today) >= start && Date.parse(today) <= end;

  const dot = (ev) => `
          <button type="button" class="tl-dot ${ev.kind === 'outcome' ? 'is-outcome' : ''}" data-arena="${esc(ev.arena)}"
            data-event="${esc(ev.id)}" aria-controls="ev-${esc(ev.id)}" aria-pressed="false"
            style="left:${pct(ev.date)}%" aria-label="${esc(ev.date_label)}: ${esc(ev.title)}">
            <span class="tl-date" aria-hidden="true">${esc(shortDate(ev.date))}</span>
          </button>`;

  return `
  <div class="tl" data-timeline>
    <div class="tl-key">
      ${data.arenas.map((a) => `<span><i data-arena="${esc(a.id)}"></i>${esc(a.label)}</span>`).join('')}
      <span><i class="is-outcome"></i>Outcome data</span>
    </div>
    <div class="tl-axis" role="group" aria-label="Timeline of events, ${years[0]} to ${years[years.length - 1]}">
      ${data.arenas
        .map(
          (a) => `
      <div class="tl-lane">
        <span class="tl-lane-label">${esc(a.label)}</span>
        <div class="tl-track">${events.filter((e) => e.arena === a.id).map(dot).join('')}
        </div>
      </div>`
        )
        .join('')}
      <div class="tl-years" aria-hidden="true">
        <span class="tl-lane-label"></span>
        <div class="tl-track">
          ${years.map((y) => `<span class="tl-year" style="left:${pct(`${y}-01-01`)}%">${y}</span>`).join('')}
          ${todayInRange ? `<span class="tl-today" style="left:${pct(today)}%">Today</span>` : ''}
        </div>
      </div>
    </div>
    <ol class="tl-list" aria-label="Events in order">
      ${events
        .map(
          (ev) => `<li><button type="button" class="tl-item" data-event="${esc(ev.id)}" aria-controls="ev-${esc(ev.id)}" aria-pressed="false">
        <i data-arena="${esc(ev.arena)}" class="${ev.kind === 'outcome' ? 'is-outcome' : ''}"></i>
        <span class="tl-item-date">${esc(ev.date_label)}</span><span class="tl-item-title">${esc(ev.title)}</span></button></li>`
        )
        .join('')}
    </ol>
    <div class="tl-cards">${events.map((ev) => eventCard(ev, arenaLabel[ev.arena], stageInfo)).join('')}
    </div>
  </div>`;
}

// ── bar charts (data/<file>.json → charts[]) ────────────────
// A styled table: screen readers get the table, everyone else gets bars.
// Unverified or empty records render as pending, with the placeholder badge.
const usable = (r) => r.verified === true && typeof r.value === 'number';

function chartSourceLine(records) {
  const seen = new Map();
  for (const r of records) seen.set(`${r.source_short}|${r.year}`, r);
  const parts = [...seen.values()].map(
    (r) => `<a href="${esc(r.url)}" rel="noopener" target="_blank">${esc(r.source_short)}</a>${r.year ? `, ${esc(r.year)}` : ''}`
  );
  const pending = records.some((r) => !usable(r));
  return `<p class="chart-src"><span>Source${parts.length > 1 ? 's' : ''}: ${parts.join('; ')}</span>${
    pending ? ` ${placeholderBadge()}` : ''
  }</p>`;
}

export function barChart(chart) {
  // Percent charts run 0-100; count charts set "max" (e.g. 27 colleges) and "ticks".
  const max = chart.max ?? 100;
  const ticks = chart.ticks ?? [0, 25, 50, 75, 100];
  const suffix = chart.max ? '' : '%';
  const rows = chart.records
    .map((r) => {
      const ok = usable(r);
      const bar = ok
        ? `<span class="bc-bar" style="width:${((Math.min(Math.max(r.value, 0), max) / max) * 100).toFixed(2)}%"></span>`
        : `<span class="bc-pending">No verified figure yet</span>`;
      return `
        <tr class="${ok ? '' : 'is-pending'}" title="${esc(r.group)}: ${esc(ok ? r.display : 'pending')} (${esc(r.source_short)}, ${esc(r.year)})">
          <th scope="row">${esc(r.group)}<span class="bc-sub">${esc(r.source_short)}${r.year ? `, ${esc(r.year)}` : ''}</span></th>
          <td><span class="bc-track">${bar}</span><span class="bc-val">${ok ? esc(r.display) : '—'}</span></td>
        </tr>`;
    })
    .join('');

  const [a, b] = chart.records;
  const gap =
    chart.annotate === 'gap' && usable(a) && usable(b)
      ? `<p class="bc-note">Gap: ${Math.abs(a.value - b.value)} percentage points</p>`
      : '';

  return `
    <figure class="bar-chart${chart.max ? ' is-count' : ''}" id="chart-${esc(chart.id)}">
      <figcaption>
        <h3 class="bc-title" id="chart-${esc(chart.id)}-title">${esc(chart.title)}</h3>
        <p class="bc-measure">${esc(chart.measure)}</p>
      </figcaption>
      <table class="bc" style="--grid-step:${(100 / (ticks.length - 1)).toFixed(3)}%" aria-labelledby="chart-${esc(chart.id)}-title">
        <thead class="visually-hidden"><tr><th scope="col">Group</th><th scope="col">${esc(chart.measure)}</th></tr></thead>
        <tbody>${rows}
        </tbody>
      </table>
      <div class="bc-axis" aria-hidden="true"><span></span><span class="bc-ticks">${ticks
        .map((t) => `<i style="left:${((t / max) * 100).toFixed(2)}%">${t}${suffix}</i>`)
        .join('')}</span></div>
      ${gap}
      ${chartSourceLine(chart.records)}
    </figure>`;
}

export function chartCitations(data) {
  const records = [...data.charts.flatMap((c) => c.records), ...(data.stats ?? [])];
  return `<ol>${records
    .map(
      (r) => `
        <li><b>${esc(r.group)}: ${usable(r) ? esc(r.display) : 'pending'}.</b> ${esc(r.metric)}. ${esc(r.source)}. ${esc(r.data_year)}.
          <a href="${esc(r.url)}" rel="noopener" target="_blank">Source</a>. Accessed ${esc(r.accessed)}.
          <br>${esc(r.notes)}</li>`
    )
    .join('')}</ol>`;
}

// ── numbered study cards (data/<file>.json → studies[]) ─────
// APA strings mark italics with *text*; escape first, then add <i>.
const apaHtml = (apa) => esc(apa).replace(/\*([^*]+)\*/g, '<i>$1</i>');

export function studyCards(data, pipeline) {
  const stageInfo = Object.fromEntries(pipeline.stages.map((s) => [Number(s.n), s]));
  return `<ol class="grid g2 studies" aria-label="Studies">${data.studies
    .map(
      (s) => `
      <li class="cell card-n study" id="study-${esc(s.id)}">
        <span class="n" aria-hidden="true">${esc(s.n)}</span>
        <h3>${esc(s.title)}</h3>
        <p>${esc(s.finding)}</p>
        <ul class="stage-chips" aria-label="Pipeline stages">${s.stages
          .map((n) => stageInfo[n])
          .map((st) => `<li><a class="pill" href="${esc(st.file)}">${esc(st.n)} ${esc(st.short)}</a></li>`)
          .join('')}</ul>
        <p class="apa">${apaHtml(s.apa)} <a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.url)}</a></p>
        ${s.verified ? '' : placeholderBadge()}
      </li>`
    )
    .join('')}
    </ol>`;
}

export function studyNotes(data) {
  return `<ol>${data.studies
    .map((s) => `<li><b>${esc(s.n)} ${esc(s.title)}.</b> ${esc(s.notes)}</li>`)
    .join('')}</ol>`;
}

// ── supporters vs outcome card (data/<file>.json → debate) ──
// Outcome text fills {record-id} with that record's display value, so the
// numbers come from the verified records, never from the HTML.
export function debateCard(data) {
  const { supporters: s, outcome: o } = data.debate;
  const all = [...(data.charts ?? []).flatMap((c) => c.records), ...(data.stats ?? [])];
  const byId = Object.fromEntries(all.map((r) => [r.id, r]));
  const used = o.records.map((id) => byId[id]);
  const pending = used.some((r) => !r || !usable(r));
  const text = esc(o.text).replace(/\{([\w-]+)\}/g, (_, id) => (byId[id] && usable(byId[id]) ? esc(byId[id].display) : '[pending]'));
  const sources = [...new Map(used.filter(Boolean).map((r) => [r.source_short, r])).values()]
    .map((r) => `<a href="${esc(r.url)}" rel="noopener" target="_blank">${esc(r.source_short)}</a>, ${esc(r.year)}`)
    .join('; ');
  return `
    <div class="debate">
      <section class="debate-side">
        <h3 class="label">${esc(s.label)}</h3>
        <blockquote><p>“${esc(s.quote)}”</p></blockquote>
        <p class="debate-who">${esc(s.who)}</p>
        <p class="chart-src"><span>Source: <a href="${esc(s.source.url)}" rel="noopener" target="_blank">${esc(s.source.cite)}</a>, ${esc(s.source.year)}</span></p>
      </section>
      <section class="debate-side">
        <h3 class="label">${esc(o.label)}</h3>
        <p>${text}</p>
        <p class="chart-src"><span>Sources: ${sources}</span>${pending ? ` ${placeholderBadge()}` : ''}</p>
      </section>
    </div>`;
}
