// Lists every placeholder still on the site: unverified figures in /data,
// pending readings and references, and marked placeholders in the pages.
// Run with: corepack pnpm placeholders
import { readFileSync, readdirSync } from 'node:fs';
import { collectFigures } from '../lib/render.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const dataFiles = readdirSync(new URL('data/', root))
  .filter((f) => f.endsWith('.json'))
  .map((f) => [f, JSON.parse(read(`data/${f}`))]);

const out = [];
const section = (title, lines) => lines.length && out.push(`\n## ${title} (${lines.length})\n${lines.join('\n')}`);

// 1. Unverified figures, grouped by file. Pipeline gets one summary line per stage.
const figs = collectFigures(dataFiles).filter((r) => !r.verified);
const byFile = figs.reduce((acc, r) => ((acc[r.file] ??= []).push(r), acc), {});
for (const [file, rows] of Object.entries(byFile)) {
  if (file === 'pipeline.json') {
    const pipeline = dataFiles.find(([f]) => f === file)[1];
    section(`data/${file}: pipeline stage rates`, pipeline.stages.map((s) => {
      const n = Object.values(s.values).flat().filter((r) => !r.verified).length;
      const sets = s.datasets.map((d) => pipeline.datasets[d].name).join('; ');
      return `- Stage ${s.n} ${s.short}: ${n} group values. Needs: ${s.metric}. From: ${sets}.`;
    }));
  } else {
    section(`data/${file}`, rows.map((r) => `- ${r.figure}. Needs: a verified value${r.source ? ` (candidate: ${r.source})` : ''}.`));
  }
}

// 2. Placeholder rows in tables (programs list).
for (const [file, data] of dataFiles) {
  if (data.programs?.rows.some((r) => !r.verified)) section(`data/${file}: ${data.programs.title}`, [`- ${data.programs.rows.filter((r) => !r.verified).length} empty rows. Needs: company, program, what changed, date and a source.`]);
}

// 3. Readings and references with pending details.
const readings = dataFiles.find(([f]) => f === 'readings.json')[1];
section('data/readings.json: From class cards with a placeholder', readings.filter((r) => r.placeholder).map((r) => `- ${r.id}: ${r.placeholder}`));
const bib = dataFiles.find(([f]) => f === 'bibliography.json')[1];
section('data/bibliography.json: references with pending details', bib.entries.filter((e) => e.pending).map((e) => `- ${e.apa}`));

// 4. Marked placeholders in the page files (author's writing, empty From class pairings, stub pages).
const pageLines = [];
// styleguide.html shows sample placeholders on purpose, so it is skipped.
for (const f of readdirSync(root).filter((f) => f.endsWith('.html') && f !== 'styleguide.html')) {
  const html = read(f);
  for (const m of html.matchAll(/<span class="tag">([^<]*Placeholder[^<]*)<\/span>\s*<p>([\s\S]*?)<\/p>/g)) {
    pageLines.push(`- ${f}: ${m[1].replace(/\s+/g, ' ')}: ${m[2].replace(/\s+/g, ' ').trim()}`);
  }
  for (const m of html.matchAll(/<!-- @fromclass ([\w-]+) -->/g)) {
    if (!readings.some((r) => r.id === m[1])) pageLines.push(`- ${f}: From class card "${m[1]}" has no reading yet.`);
  }
  if (/class="stub"/.test(html)) pageLines.push(`- ${f}: stub page, content not built yet.`);
}
section('Pages', pageLines);

console.log(`# Placeholders still on the site${out.join('\n')}\n`);
