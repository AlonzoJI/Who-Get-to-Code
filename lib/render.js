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
          <span>Source: ${
            record.url
              ? `<a href="${esc(record.url)}" rel="noopener" target="_blank">${esc(record.source_short)}${record.year ? `, ${esc(record.year)}` : ''}</a>`
              : `${esc(record.source_short)}, ${record.year ? esc(record.year) : 'year pending'}`
          }</span>
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

// Every chart record in pipeline.json: the baseline and each stage, across periods.
const pipelineColumns = (pipeline) => [pipeline.baseline, ...pipeline.stages];
const pipelineRecords = (pipeline) =>
  pipelineColumns(pipeline).flatMap((s) => Object.values(s.values).flat());

// The source line that sits directly under the pipeline diagram.
export function pipelineSource(pipeline) {
  const records = pipelineRecords(pipeline);
  const verified = records.filter((r) => r.verified === true && typeof r.value === 'number');
  const years = [...new Set(verified.map((r) => r.year))].sort();
  return `<p class="chart-src">Source: each stage's own dataset, listed beside the chart and by stage below. Years: ${
    years.length ? esc(years.join(', ')) : 'pending until figures are verified'
  }. ${verified.length} of ${records.length} figures verified.${
    verified.length < records.length ? ` ${placeholderBadge()}` : ''
  }</p>`;
}

export function datasetsByStage(pipeline) {
  return `<ul class="ds-list" aria-label="Datasets for each stage">${pipelineColumns(pipeline)
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
          <p class="chart-src"><span>${o.source
            ? `${o.more_sources?.length ? 'Sources' : 'Source'}: ${[o.source, ...(o.more_sources ?? [])].map((src) => `${link(src)}${withYear(src)}`).join('; ')}`
            : 'Source: pending'}</span>${
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
            style="left:${pct(ev.date)}%">
            <span class="tl-date">${esc(shortDate(ev.date))}</span><span class="visually-hidden">: ${esc(ev.title)} (${esc(ev.date_label)})</span>
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
  const allPending = records.every((r) => !usable(r) && !r.year);
  if (allPending) {
    return `<p class="chart-src"><span>Source and year: pending. Candidate source: ${parts.join('; ')}</span> ${placeholderBadge()}</p>`;
  }
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
      const sub = chart.showDataYear ? esc(r.data_year) : `${esc(r.source_short)}${r.year ? `, ${esc(r.year)}` : ''}`;
      const bar = ok
        ? `<span class="bc-bar" style="width:${((Math.min(Math.max(r.value, 0), max) / max) * 100).toFixed(2)}%"></span>`
        : `<span class="bc-pending">No verified figure yet</span>`;
      return `
        <tr class="${ok ? '' : 'is-pending'}" data-record="${esc(r.id)}" title="${esc(r.group)}: ${esc(ok ? r.display : 'pending')} (${esc(r.source_short)}, ${esc(r.year)})">
          <th scope="row">${esc(r.group)}<span class="bc-sub">${sub}</span></th>
          <td><span class="bc-track">${bar}</span><span class="bc-val">${ok ? esc(r.display) : '—'}</span></td>
        </tr>`;
    })
    .join('');

  const [a, b] = chart.records;
  const gap =
    chart.annotate === 'gap' && usable(a) && usable(b)
      ? `<p class="bc-note">Gap: ${Math.abs(a.value - b.value)} percentage points</p>`
      : '';
  const note = chart.note ? `<p class="bc-note">${esc(chart.note)}</p>` : '';

  return `
    <figure class="bar-chart${chart.max ? ' is-count' : ''}" id="chart-${esc(chart.id)}" data-max="${max}"${chart.showDataYear ? ' data-show-data-year' : ''}>
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
      ${note}
      ${chartSourceLine(chart.records)}
    </figure>`;
}

// One-line headline above the representation chart. Numbers come from verified
// records in pipeline.json ({record-id} slots); any missing record keeps the placeholder.
export function pipelineHeadline(pipeline) {
  const h = pipeline.headline;
  const byId = Object.fromEntries(pipelineRecords(pipeline).map((r) => [r.id, r]));
  const used = (h?.records ?? []).map((id) => byId[id]);
  if (!h || h.verified !== true || !used.length || used.some((r) => !r || !usable(r))) {
    return `<div class="ph-copy pl-headline"><span class="tag">Placeholder</span><p>Headline finding goes here: one sentence stating the clearest verified result in the chart.</p></div>`;
  }
  const text = esc(h.text).replace(/\{([\w-]+)\}/g, (_, id) => esc(byId[id].display));
  const sources = [...new Map(used.map((r) => [r.url, r])).values()]
    .map((r) => `<a href="${esc(r.url)}" rel="noopener" target="_blank">${esc(r.source_short)}</a>, ${esc(r.data_year ?? r.year)}`)
    .join('; ');
  return `<div class="pl-headline"><p class="pl-headline-text">${text}</p><p class="chart-src">Sources: ${sources}</p></div>`;
}

// Table version of the representation chart: one table per group type, a row per
// group, a column per stage. Stage 04 shows both periods.
export function representationTable(pipeline) {
  const cols = pipelineColumns(pipeline).flatMap((c) => c.has_periods
    ? pipeline.periods.map((p) => ({ c, period: p.id, head: `${c.n} ${c.short} (${p.label.replace(' the rollback', '').toLowerCase()})` }))
    : [{ c, period: 'current', head: `${c.n} ${c.short}` }]);
  const cell = (r) => {
    if (!r || r.verified !== true || typeof r.value !== 'number') return '<td class="fig-v">Pending</td>';
    return `<td class="fig-v">${esc(r.display)}${r.derived ? '*' : ''}<span class="pl-src"><a href="${esc(r.url)}" rel="noopener" target="_blank">${esc(r.source_short ?? r.source)}, ${esc(r.data_year ?? r.year)}</a></span></td>`;
  };
  const tables = pipeline.dimensions.filter((d) => d.id !== 'all').map((d) => `
    <h4 class="label pl-table-title" id="pl-table-${esc(d.id)}">${esc(d.label)}: share of each stage, in percent</h4>
    <div class="fig-scroll" tabindex="0" role="region" aria-labelledby="pl-table-${esc(d.id)}">
      <table class="fig-table pl-rep-table">
        <thead><tr><th scope="col">Group</th>${cols.map((x) => `<th scope="col">${esc(x.head)}</th>`).join('')}</tr></thead>
        <tbody>${d.groups.map((g) => `<tr><th scope="row">${esc(g.label)}</th>${cols.map((x) =>
          cell(x.c.values[x.period]?.find((r) => r.group === `${d.id}:${g.id}`))).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>`).join('');
  return `${tables}<p class="chart-src">* Derived from more than one published figure; the calculation is in the record's notes on the Methods page.</p>`;
}

export function studentAccessChart(pipeline) {
  const stage = pipeline.stages.find((s) => s.id === 'stage-1');
  const labels = new Map(pipeline.dimensions.flatMap((d) => d.groups.map((g) => [
    d.id === 'all' ? 'all' : `${d.id}:${g.id}`, g.label,
  ])));
  return barChart({
    id: 'student-access',
    title: 'Attendance at public high schools that offer foundational CS',
    measure: 'Share of students within each group',
    showDataYear: true,
    records: stage.inputs.filter((r) => r.group === 'all' || r.group.startsWith('race:'))
      .map((r) => ({ ...r, group: labels.get(r.group) })),
  });
}

export function chartCitations(data) {
  const records = [...data.charts.flatMap((c) => c.records), ...(data.stats ?? []), ...(data.research ?? [])];
  return `<ol>${records
    .map(
      (r) => `
        <li><b>${esc(r.group)}: ${usable(r) || (r.verified === true && !('value' in r)) ? esc(r.display) : 'pending'}.</b> ${esc(r.metric)}. ${esc(r.source)}. ${esc(r.data_year)}.
          <a href="${esc(r.url)}" rel="noopener" target="_blank">Source</a>. Accessed ${esc(r.accessed)}.
          <br>${esc(r.notes)}</li>`
    )
    .join('')}</ol>`;
}

// ── numbered study cards (data/<file>.json → studies[]) ─────
// APA strings mark italics with *text*; escape first, then add <i>.
const apaHtml = (apa) =>
  esc(apa)
    .replace(/\*([^*]+)\*/g, '<i>$1</i>')
    .replace(/(https:\/\/doi\.org\/[^\s<]+)/g, '<a href="$1" rel="noopener" target="_blank">$1</a>');

export function studyCards(data, pipeline) {
  const stageInfo = Object.fromEntries(pipeline.stages.map((s) => [Number(s.n), s]));
  return `<ol class="grid g2 studies" aria-label="Studies">${data.studies
    .map(
      (s) => `
      <li class="cell card-n study" id="study-${esc(s.id)}">
        <span class="n" aria-hidden="true">${esc(s.n)}</span>
        <h3>${esc(s.title)}</h3>
        <p>${esc(s.finding)}</p>
        ${s.list ? `<ul class="card-list">${s.list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
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
  const pending = o.verified === false || used.some((r) => !r || !usable(r));
  const text = esc(o.text).replace(/\{([\w-]+)\}/g, (_, id) => (byId[id] && usable(byId[id]) ? esc(byId[id].display) : '[pending]'));
  const sources = [...new Map(used.filter(Boolean).map((r) => [r.source_short, r])).values()]
    .map((r) => `<a href="${esc(r.url)}" rel="noopener" target="_blank">${esc(r.source_short)}</a>, ${esc(r.year)}`)
    .join('; ');
  return `
    <div class="debate">
      <section class="debate-side">
        <h3 class="label">${esc(s.label)}</h3>
        <blockquote><p>${s.lead ? `${esc(s.lead)} ` : ''}“${esc(s.quote)}”</p></blockquote>
        <p class="debate-who">${esc(s.who)}</p>
        <p class="chart-src"><span>Source: <a href="${esc(s.source.url)}" rel="noopener" target="_blank">${esc(s.source.cite)}</a>${withYear(s.source)}</span></p>
      </section>
      <section class="debate-side">
        <h3 class="label">${esc(o.label)}</h3>
        <p>${text}</p>
        <p class="chart-src"><span>${sources ? `Sources: ${sources}` : 'Source: pending'}</span>${pending ? ` ${placeholderBadge()}` : ''}</p>
      </section>
    </div>`;
}

// ── cascade explainer intro (data/college.json → cascade) ───
export function cascadeIntro(data) {
  const c = data.cascade;
  const src = (s) => `<a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.cite)}</a>, ${esc(s.year)}`;
  return `
    <p class="lede cx-why">${esc(c.why.text)}</p>
    <p class="chart-src"><span>Sources: ${c.why.sources.map(src).join('; ')}</span></p>`;
}

export function cascadeFoot(data) {
  const t = data.cascade.tier_source;
  return `<p class="chart-src"><span>Tiers: <a href="${esc(t.url)}" rel="noopener" target="_blank">${esc(t.cite)}</a>, ${esc(t.year)}</span></p>`;
}

// ── "The other side" card (data/<file>.json → other_side) ───
export function otherSide(data) {
  const o = data.other_side;
  const position = (p) => `
      <section class="os-pos">
        <span class="os-stance">${esc(p.stance)}</span>
        <h4>${esc(p.who)}</h4>
        <blockquote><p>${p.quote_lead ? `${esc(p.quote_lead)} ` : ''}“${esc(p.quote)}”</p></blockquote>
        <ul>${p.points.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        ${p.figure ? `<p class="os-figure">${esc(p.figure)}</p>` : ''}
        <p class="chart-src"><span>Source: <a href="${esc(p.source.url)}" rel="noopener" target="_blank">${esc(p.source.cite)}</a></span>${
          p.verified ? '' : ` ${placeholderBadge()}`
        }</p>
      </section>`;
  return `
    <aside class="other-side" aria-labelledby="other-side-title">
      <div class="os-head">
        <span class="eyebrow">The other side</span>
        <h3 id="other-side-title">What supporters of the ruling and critics of the decline story argue</h3>
        <p>${esc(o.intro)}</p>
      </div>
      <div class="os-grid">${o.positions.map(position).join('')}
      </div>
      <p class="os-synthesis">${esc(o.synthesis)}</p>
    </aside>`;
}

export function otherSideNotes(data) {
  return `<ol>${data.other_side.positions.map((p) => `<li><b>${esc(p.who)}.</b> ${esc(p.notes)}</li>`).join('')}</ol>`;
}

// ── data-problem note (data/<file>.json → note) ─────────────
export function dataNote(data) {
  const n = data.note;
  return `
    <aside class="data-note" aria-labelledby="data-note-title">
      <span class="eyebrow">${esc(n.eyebrow)}</span>
      <h3 id="data-note-title">${esc(n.title)}</h3>
      <p>${esc(n.text)}</p>
      <p class="chart-src"><span>Source: <a href="${esc(n.source.url)}" rel="noopener" target="_blank">${esc(n.source.cite)}</a></span>${
        n.verified ? '' : ` ${placeholderBadge()}`
      }</p>
    </aside>`;
}

// ── placeholder program list (data/<file>.json → programs) ──
export function programList(data) {
  const p = data.programs;
  const cell = (v) => (v == null ? '<span class="pending-cell">Pending</span>' : esc(v));
  return `
    <figure class="program-list">
      <figcaption>
        <h3 class="bc-title">${esc(p.title)}</h3>
        <p class="bc-measure">${esc(p.note)}</p>
      </figcaption>
      <div class="prog-scroll" tabindex="0" role="region" aria-label="${esc(p.title)}">
      <table>
        <thead><tr><th scope="col">Company</th><th scope="col">Program</th><th scope="col">What changed</th><th scope="col">Date</th><th scope="col">Source</th></tr></thead>
        <tbody>${p.rows
          .map(
            (r) => `<tr><td>${cell(r.company)}</td><td>${cell(r.program)}</td><td>${cell(r.change)}</td><td>${cell(r.date)}</td><td>${
              r.url ? `<a href="${esc(r.url)}" rel="noopener" target="_blank">${esc(r.source ?? 'Source')}</a>` : cell(r.source)
            }</td></tr>`
          )
          .join('')}</tbody>
      </table>
      </div>
      <p class="chart-src"><span>${
        p.rows.some((r) => r.url)
          ? `Sources: ${p.rows.filter((r) => r.url).map((r) => `<a href="${esc(r.url)}" rel="noopener" target="_blank">${esc(r.source)}</a>`).join('; ')}`
          : 'Source: pending'
      }</span>${p.rows.some((r) => !r.verified) ? ` ${placeholderBadge()}` : ''}</p>
    </figure>`;
}

// ── law quote box (data/<file>.json → sb1) ──────────────────
export function lawBox(data) {
  const l = data.sb1;
  return `
    <aside class="law-box" aria-labelledby="law-box-title">
      <h3 class="label" id="law-box-title">${esc(l.title)}</h3>
      <ul>${l.items
        .map(
          (i) => `<li><p>${i.lead ? `${esc(i.lead)} ` : ''}“${esc(i.quote)}”</p><span class="law-sec">${esc(i.section)}</span></li>`
        )
        .join('')}</ul>
      <p class="law-note">${esc(l.note)}</p>
      <p class="chart-src"><span>Source: <a href="${esc(l.source.url)}" rel="noopener" target="_blank">${esc(l.source.cite)}</a>${withYear(l.source)}</span></p>
    </aside>`;
}

// ── methods page: every figure in /data, plus the bibliography ──
// A "figure" is any object with metric + verified (stat, chart and pipeline
// records), or any verified-flagged object that carries a text/figure and a
// source object (timeline outcomes, other-side figures, notes).
export const FIGURE_PAGES = {
  'home-stats.json': ['Overview', 'index.html'],
  'pipeline.json': ['Pipeline diagram', 'index.html#pipeline'],
  'school-access.json': ['School offerings', 'stage-1-offers.html'],
  'cs-enrollment.json': ['High school enrollment', 'stage-2-enrolls.html'],
  'before-classroom.json': ['Before the classroom', 'before-the-classroom.html'],
  'ap-exams.json': ['AP computer science exams', 'stage-3-ap.html'],
  'rollback.json': ['Rollback', 'rollback.html'],
  'college.json': ['College placements', 'stage-4-college.html'],
  'workforce.json': ['Workforce', 'stage-6-hired.html'],
  'about.json': ['About', 'about.html'],
};

export function collectFigures(files) {
  const rows = [];
  for (const [file, data] of files) {
    if (!FIGURE_PAGES[file]) continue;
    const walk = (v, ctx) => {
      if (Array.isArray(v)) return v.forEach((x) => walk(x, ctx));
      if (!v || typeof v !== 'object') return;
      if ('metric' in v && 'verified' in v) {
        rows.push({
          file,
          figure: v.group && v.group !== v.metric ? `${v.metric} (${v.group})` : v.metric,
          value: v.verified === true && (typeof v.value === 'number' || !('value' in v)) ? v.display : null,
          source: v.source,
          year: v.year,
          url: v.url,
          verified: v.verified === true && (typeof v.value === 'number' || !('value' in v)),
        });
        return;
      }
      const text = v.figure ?? v.text;
      // source may be null for a placeholder that has no source yet; it still belongs in the table
      if ('verified' in v && 'source' in v && (v.source === null || typeof v.source === 'object') && typeof text === 'string') {
        rows.push({
          file,
          figure: ctx ?? v.title ?? v.who ?? 'Note',
          value: v.verified === true ? text : null,
          source: v.source?.cite ?? null,
          year: v.source?.year ?? null,
          url: v.source?.url ?? null,
          verified: v.verified === true && v.source !== null,
        });
      }
      for (const [k, x] of Object.entries(v)) walk(x, v.title ? `${v.title}: ${k}` : ctx);
    };
    walk(data, null);
  }
  return rows;
}

export function figureSummary(rows) {
  const verified = rows.filter((r) => r.verified).length;
  const tile = (v, cap) => `<li class="cell stat"><p class="v">${v}</p><p class="cap">${esc(cap)}</p></li>`;
  return `<ul class="grid g3" aria-label="Figure counts">${tile(rows.length, 'figures and placeholders tracked in /data.')}${tile(
    verified,
    'checked against their source and marked verified.'
  )}${tile(rows.length - verified, 'still placeholders, shown on the site with a badge.')}</ul>`;
}

export function figureTable(rows) {
  const groups = Object.entries(FIGURE_PAGES)
    .map(([file, [label, href]]) => ({ file, label, href, rows: rows.filter((r) => r.file === file) }))
    .filter((g) => g.rows.length);
  return groups
    .map((g) => {
      const v = g.rows.filter((r) => r.verified).length;
      return `
    <details class="fig-group"${g.file === 'pipeline.json' ? '' : ' open'}>
      <summary><span class="fig-name">${esc(g.label)}</span><span class="fig-count">${v} verified · ${g.rows.length - v} placeholder · <code>data/${esc(g.file)}</code></span></summary>
      <div class="fig-scroll" tabindex="0" role="region" aria-label="${esc(g.label)} figures table">
      <table class="fig-table">
        <thead><tr><th scope="col">Figure</th><th scope="col">Value</th><th scope="col">Source</th><th scope="col">Year</th><th scope="col">Verified</th></tr></thead>
        <tbody>${g.rows
          .map(
            (r) => `<tr>
          <td>${esc(r.figure)}</td>
          <td class="fig-v">${r.value ? esc(r.value) : '—'}</td>
          <td>${r.url ? `<a href="${esc(r.url)}" rel="noopener" target="_blank">${esc(r.source ?? 'Source')}</a>` : esc(r.source ?? 'Pending')}</td>
          <td class="fig-y">${esc(r.year ?? '—')}</td>
          <td>${r.verified ? '<span class="fig-ok">Yes</span>' : `<span class="fig-no">No</span> ${placeholderBadge()}`}</td>
        </tr>`
          )
          .join('')}</tbody>
      </table>
      </div>
      <p class="fig-link"><a href="${esc(g.href)}">See these figures on the ${esc(g.label)} page</a></p>
    </details>`;
    })
    .join('');
}

const sortKey = (apa) => apa.replace(/[*“”"'‘’]/g, '').replace(/^the /i, '').toLowerCase();
export function bibliography(bib) {
  const entries = [...bib.entries].sort((a, b) => sortKey(a.apa).localeCompare(sortKey(b.apa)));
  return `<ol class="bib" aria-label="References">${entries
    .map(
      (e) => `<li${e.pending ? ' class="is-pending"' : ''}>${apaHtml(e.apa)}${
        e.url && !e.apa.includes(e.url) ? ` <a href="${esc(e.url)}" rel="noopener" target="_blank">${esc(e.url)}</a>` : ''
      }${e.kind === 'reading' ? ' <span class="pill">Class reading</span>' : ''}${e.pending ? ` ${placeholderBadge()}` : ''}</li>`
    )
    .join('')}</ol>`;
}

// Rows for the figure table from MongoDB datapoints (GET /api/datapoints), in
// the same shape collectFigures() builds from /data. Used in the browser.
export function rowsFromDatapoints(docs) {
  const order = Object.keys(FIGURE_PAGES);
  return [...docs]
    .filter((d) => FIGURE_PAGES[d.sourceFile])
    .sort((a, b) => order.indexOf(a.sourceFile) - order.indexOf(b.sourceFile))
    .map((d) => {
      const label = d.group?.label;
      return {
        file: d.sourceFile,
        figure: label && label !== d.metric ? `${d.metric} (${label})` : d.metric,
        value: d.verified ? d.display ?? (typeof d.value === 'number' ? String(d.value) : null) : null,
        source: d.source?.title ?? null,
        year: d.year ?? null,
        url: d.source?.url ?? null,
        verified: d.verified === true,
      };
    });
}
