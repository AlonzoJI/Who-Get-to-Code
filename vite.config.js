import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import * as render from './lib/render.js';

const root = import.meta.dirname;
const readJson = (name) => JSON.parse(readFileSync(resolve(root, 'data', `${name}.json`), 'utf8'));
const readPartial = (name) => readFileSync(resolve(root, 'partials', `${name}.html`), 'utf8');

// Every .html file in the project root is its own page.
const pages = Object.fromEntries(
  readdirSync(root)
    .filter((f) => f.endsWith('.html'))
    .map((f) => [f.replace(/\.html$/, ''), resolve(root, f)])
);

// Markers a page can use:
//   <!-- @head -->  <!-- @nav -->  <!-- @foot -->
//   <!-- @stats <data-file> -->  <!-- @citations <data-file> -->
//   <!-- @pipeline -->  <!-- @pipeline-source -->  <!-- @datasets -->  <!-- @timeline -->  <!-- @fromclass <reading-id> -->
function sitePartials() {
  return {
    name: 'site-partials',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const pageId = html.match(/<body[^>]*data-page="([^"]+)"/)?.[1] ?? '';
        const nav = readPartial('nav').replace(
          `data-nav="${pageId}"`,
          `data-nav="${pageId}" aria-current="page"`
        );
        return html
          .replace('<!-- @head -->', readPartial('head'))
          .replace('<!-- @nav -->', nav)
          .replace('<!-- @foot -->', readPartial('foot'))
          .replace(/<!-- @stats ([\w-]+) -->/g, (_, file) => render.statGrid(readJson(file), 'Key figures'))
          .replace(/<!-- @citations ([\w-]+) -->/g, (_, file) => render.citationList(readJson(file)))
          .replace('<!-- @pipeline -->', () => render.pipelineCards(readJson('pages')))
          .replace('<!-- @pipeline-source -->', () => render.pipelineSource(readJson('pipeline')))
          .replace('<!-- @datasets -->', () => render.datasetsByStage(readJson('pipeline')))
          .replace('<!-- @timeline -->', () => render.rollbackTimeline(readJson('rollback'), readJson('pipeline')))
          .replace(/<!-- @fromclass ([\w-]+) -->/g, (_, id) =>
            render.fromClassCard(readJson('readings').find((r) => r.id === id))
          );
      },
    },
    // Data and partials aren't imported by JS, so reload the page when they change.
    handleHotUpdate({ file, server }) {
      if (/[\\/](data|partials|lib)[\\/]/.test(file)) server.ws.send({ type: 'full-reload' });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [sitePartials()],
  build: { rollupOptions: { input: pages } },
});
