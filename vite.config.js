import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import * as render from './lib/render.js';
import { outreachForm } from './lib/outreach-form.js';

const root = import.meta.dirname;
const readJson = (name) => JSON.parse(readFileSync(resolve(root, 'data', `${name}.json`), 'utf8'));
// Every data file, for pages that summarize the whole site (methods and sources).
const readAllData = () =>
  readdirSync(resolve(root, 'data'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f, JSON.parse(readFileSync(resolve(root, 'data', f), 'utf8'))]);
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
//   <!-- @pipeline -->  <!-- @pipeline-source -->  <!-- @datasets -->  <!-- @timeline -->
//   <!-- @studies <data-file> -->  <!-- @study-notes <data-file> -->
//   <!-- @other-side <data-file> -->  <!-- @other-side-notes <data-file> -->
//   <!-- @cards <data-file> <key> -->  <!-- @card-notes <data-file> <key> -->  <!-- @programs <data-file> -->
//   <!-- @figure-summary -->  <!-- @figure-table -->  <!-- @bibliography -->
//   <!-- @law-box <data-file> -->  <!-- @data-note <data-file> -->  <!-- @debate <data-file> -->  <!-- @cascade-intro <data-file> -->  <!-- @cascade-foot <data-file> -->
//   <!-- @chart <data-file> <chart-id> -->  <!-- @chart-citations <data-file> -->  <!-- @fromclass <reading-id> -->
//   <!-- @outreach-form -->  (lib/outreach-form.js, choices from lib/outreach-options.js)
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
          .replace(/<!-- @stats ([\w-]+) -->/g, (_, file) => {
            const data = readJson(file);
            return render.statGrid(Array.isArray(data) ? data : data.stats, 'Key figures');
          })
          .replace(/<!-- @citations ([\w-]+) -->/g, (_, file) => render.citationList(readJson(file)))
          .replace('<!-- @pipeline -->', () => render.pipelineCards(readJson('pages')))
          .replace('<!-- @pipeline-source -->', () => render.pipelineSource(readJson('pipeline')))
          .replace('<!-- @datasets -->', () => render.datasetsByStage(readJson('pipeline')))
          .replace('<!-- @student-access -->', () => render.studentAccessChart(readJson('pipeline')))
          .replace(/<!-- @chart ([\w-]+) ([\w-]+) -->/g, (_, file, id) =>
            render.barChart(readJson(file).charts.find((c) => c.id === id))
          )
          .replace(/<!-- @cascade-intro ([\w-]+) -->/g, (_, file) => render.cascadeIntro(readJson(file)))
          .replace(/<!-- @cascade-foot ([\w-]+) -->/g, (_, file) => render.cascadeFoot(readJson(file)))
          .replace(/<!-- @other-side ([\w-]+) -->/g, (_, file) => render.otherSide(readJson(file)))
          .replace(/<!-- @other-side-notes ([\w-]+) -->/g, (_, file) => render.otherSideNotes(readJson(file)))
          .replace(/<!-- @data-note ([\w-]+) -->/g, (_, file) => render.dataNote(readJson(file)))
          .replace(/<!-- @cards ([\w-]+) ([\w-]+) -->/g, (_, file, key) =>
            render.studyCards({ studies: readJson(file)[key] }, readJson('pipeline'))
          )
          .replace(/<!-- @card-notes ([\w-]+) ([\w-]+) -->/g, (_, file, key) => render.studyNotes({ studies: readJson(file)[key] }))
          .replace(/<!-- @programs ([\w-]+) -->/g, (_, file) => render.programList(readJson(file)))
          .replace(/<!-- @law-box ([\w-]+) -->/g, (_, file) => render.lawBox(readJson(file)))
          .replace('<!-- @figure-summary -->', () => render.figureSummary(render.collectFigures(readAllData())))
          .replace('<!-- @figure-table -->', () => render.figureTable(render.collectFigures(readAllData())))
          .replace('<!-- @bibliography -->', () => render.bibliography(readJson('bibliography')))
          .replace(/<!-- @debate ([\w-]+) -->/g, (_, file) => render.debateCard(readJson(file)))
          .replace(/<!-- @chart-citations ([\w-]+) -->/g, (_, file) => render.chartCitations(readJson(file)))
          .replace(/<!-- @studies ([\w-]+) -->/g, (_, file) => render.studyCards(readJson(file), readJson('pipeline')))
          .replace(/<!-- @study-notes ([\w-]+) -->/g, (_, file) => render.studyNotes(readJson(file)))
          .replace('<!-- @timeline -->', () => render.rollbackTimeline(readJson('rollback'), readJson('pipeline')))
          .replace('<!-- @outreach-form -->', () => outreachForm())
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

// Dev only: serves the Vercel functions in /api from `corepack pnpm dev`, so
// forms and API-backed charts work locally. /api/submissions/educator maps to
// api/submissions/educator.js and calls its GET or POST export with a standard
// Request. MONGODB_*, RATE_LIMIT_SALT and ADMIN_PASSWORD come from .env. Vercel does this in production.
function apiDev() {
  const apiDir = resolve(root, 'api') + sep;
  return {
    name: 'api-dev',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, root, ['MONGODB_', 'RATE_LIMIT_', 'ADMIN_']);
      for (const [key, value] of Object.entries(env)) process.env[key] ??= value;

      server.middlewares.use(async (req, res, next) => {
        const { pathname } = new URL(req.url, 'http://localhost');
        // Same as the /admin rewrite in vercel.json.
        if (pathname === '/admin') {
          req.url = '/admin.html';
          return next();
        }
        if (!pathname.startsWith('/api/')) return next();
        const file = resolve(root, `.${pathname.replace(/\/$/, '')}.js`);
        if (!file.startsWith(apiDir) || !existsSync(file)) return next();
        try {
          const handler = (await server.ssrLoadModule(file))[req.method];
          if (typeof handler !== 'function') {
            res.statusCode = 405;
            return res.end();
          }
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (value != null && !key.startsWith(':')) headers.set(key, [].concat(value).join(', '));
          }
          const response = await handler(
            new Request(`http://${req.headers.host}${req.url}`, {
              method: req.method,
              headers,
              body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
            })
          );
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          next(err);
        }
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [sitePartials(), apiDev()],
  build: { rollupOptions: { input: pages } },
});
