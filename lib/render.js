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
  return `<aside class="fromclass" aria-label="From class: ${esc(reading.author)}">
      <div class="bar"><span>From class</span><span class="course">ESPHE 3206</span></div>
      <div class="body">
        <div class="cite">
          <h3>${esc(reading.author)}, “${esc(reading.title)}”</h3>
          <p class="meta">${esc(reading.work)} · ${esc(reading.publisher)}, ${esc(reading.year)}</p>
          <p class="meta">${esc(reading.idea)}</p>
        </div>
        <div class="tie">${reading.tie.map((t) => `<p>${esc(t)}</p>`).join('')}</div>
      </div>
    </aside>`;
}
