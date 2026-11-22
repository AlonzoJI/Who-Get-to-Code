# Project

A published, interactive resource website for my ESPHE 3206 (School & Society) Applied Project at Ohio State. The title is "Who Gets to Be a Computer Scientist." The audience is high school Computer Science teachers and school counselors. Due Dec 11, 2026.

# Argument

More high schools offer Computer Science than ever before but the students who take it and stick with it still mostly look the same. Since 2023 the programs built to widen that pipeline have been rolled back in courts, in federal agencies, in Ohio law and in tech companies. The site tracks OUTCOMES (who enrolls, who gets into which college, who gets hired) and asks what the rollback is doing to them.

# Outcomes pipeline (the spine of the site)

1. School offers Computer Science
2. Student enrolls in a Computer Science class
3. Student takes an AP Computer Science exam
4. Student enrolls in college and in which kind of college
5. Student earns a Computer Science degree
6. Graduate gets hired in tech and what they earn

# Hard rules

- NEVER invent numbers. Every figure must be real, cited and dated
- Curated data starts in /data as JSON or CSV, which is the seed data a script loads into MongoDB. Every record, in a file or in the database, has source, year, url and a verified true/false flag
- Anything not yet verified renders with a visible "placeholder data" badge
- Every chart shows its source and year directly under it
- Present the rollback debate fairly. Each policy section includes a short card on what supporters of the change argue, with a cited source, next to what the outcome data shows
- Do not write my personal story or reflection copy. Leave marked placeholders
- Every section ends with a "From class" card that ties it to a course reading (I will give you the pairings in each part)

# Hard rules for the database and contributions (added Nov 21, 2026)

- The MongoDB connection string lives only in the `MONGODB_URI` environment variable. Never commit it. `.env` is gitignored and `.env.example` shows the variable names with no real values
- Every submission is saved with `status: "pending"`. Nothing a visitor submits appears on the site until I approve it
- Never collect student names or any information that could identify a student
- Any count under 10 is never shown publicly, so small schools cannot be identified
- Contact emails are stored for follow-up only and are never shown on the site or returned by any public API
- Every form says clearly how the answers will be used and asks for consent to publish
- All earlier hard rules still apply. Never invent numbers, and every figure keeps source, year, url and verified

# Tech

Vite frontend (plain HTML, CSS and JS) plus a small backend of Vercel serverless functions in `/api`, using the official MongoDB Node.js driver against MongoDB Atlas (free tier). MongoDB was chosen because the data comes in many different shapes. Deploys on Vercel. D3 or Observable Plot for charts. Responsive, keyboard accessible and readable contrast.

# Contributors

Besides the main audience, two groups can contribute:
- K-12 Computer Science educators can share what they see in their schools
- STEM outreach leaders can list their programs

# Structure & conventions (agreed Nov 20, 2026)

- Vite multi-page site. Every `.html` in the repo root is a page. Run with `corepack pnpm dev`, build with `corepack pnpm build` (output in `dist/`, relative paths).
- Shared markup lives in `partials/` (head, nav, foot). Pages use HTML comment markers that `vite.config.js` replaces at build time using `lib/render.js`:
  `<!-- @head -->`, `<!-- @nav -->`, `<!-- @foot -->`, `<!-- @stats <data-file> -->`, `<!-- @citations <data-file> -->`, `<!-- @pipeline -->`, `<!-- @fromclass <reading-id> -->`.
  `<body data-page="...">` sets the active nav link.
- Data records (`/data/*.json`) use: `id, stage, metric, group, value, unit, display, caption, data_year, year, source, source_short, url, verified, accessed, notes`. `verified: false` or `value: null` renders the "Placeholder data" badge automatically. `notes` holds the exact quote from the source plus caveats.
- `data/pipeline.json` drives the interactive pipeline on the home page (`src/pipeline/`). Each record's `value` is the percent of the group who move on from the previous stage. `null` or `verified: false` removes nobody and shows the placeholder badge. Stages with `has_periods: true` hold `before` and `after` sets; others hold `current`. Math lives in `src/pipeline/model.js` and is tested with `corepack pnpm test`.
- `data/rollback.json` drives the timeline on `rollback.html` (`<!-- @timeline -->`, `src/rollback.js`). Each event has `happened`, `stages`, `affects`, `sources`, a `supporters` block (verbatim quote + source, or a plain statement that no reason was given) and an `outcome` block (`verified: false` shows the badge). `notes` records caveats and anything the source does not say. Check every fact against its URL before adding an event.
- Simple bar charts are built at build time from `data/<file>.json` → `charts[]` with `<!-- @chart <file> <chart-id> -->` (a styled `<table>`, so screen readers and no-JS readers get the numbers) and `<!-- @chart-citations <file> -->` for the technical version. Styles in `src/styles/charts.css`. Use Observable Plot only for charts that need more than bars.
- Bar charts take `max` and `ticks` for count scales (e.g. "25 of 27"). A data file can also hold `stats[]` (rendered by `<!-- @stats <file> -->`) and a `debate` block (`<!-- @debate <file> -->`): a supporters quote beside outcome text whose `{record-id}` slots fill from verified records, so numbers never live in the HTML.
- Illustrative animations (no verified flow numbers) must carry the "Illustrative, not data" badge (`.badge-illus`) and say so in text; see the cascade explainer (`src/college/cascade.js`, `data/college.json` → `cascade`, markers `@cascade-intro` / `@cascade-foot`). Qualitative research findings go in a file's `research[]` and print in the technical version via `@chart-citations`.
- Any list in a data file shaped like `studies[]` can render as numbered cards with `<!-- @cards <file> <key> -->` (notes via `@card-notes`); a `programs` block renders as a placeholder table with `<!-- @programs <file> -->`. Stage pages double as section pages: stage 04 = College placements, stage 06 = Workforce.
- `sources.html` (Methods and sources) builds its figure table and counts from every file in `/data` (`collectFigures` in `lib/render.js`; add new data files to `FIGURE_PAGES`). The bibliography lives in `data/bibliography.json` as APA 7 strings; `tests/bibliography.test.js` fails if any URL in `/data` has no entry, so add a reference whenever you add a source.
- Deploys to Vercel (`vercel.json`: pnpm install --frozen-lockfile, pnpm build, output `dist`; functions in `/api`). `MONGODB_URI` is set in Vercel project settings and in a local `.env`, never in code. `corepack pnpm placeholders` prints every placeholder still on the site.
- Database layer (Nov 22, 2026): `lib/mongodb.js` (one reused client, `attachDatabasePool`), `lib/schema.js` ($jsonSchema validators that require core fields and allow extras; verified datapoints must have a year and source url; indexes), `lib/seed-data.js` (pure builders from /data), `scripts/seed.js` (`corepack pnpm seed`, upserts on `sourceFile+recordId` and source `key`, so reruns never duplicate). Database name comes from `MONGODB_DB`, default `who-gets-to-code`. Read-only routes: `api/datapoints.js` (stage, group, state, year; zod-validated) and `api/sources.js` (type, page). `tests/db.test.js` runs all of this against mongodb-memory-server.
- Charts are still rendered from /data at build time (the fallback, and what no-JS readers get). `src/data-client.js` fetches `/api/datapoints` once per page (4s timeout) and updates bar charts, stat tiles and the pipeline diagram by `recordId`; any API failure leaves the /data version in place. The Methods page table stays build-time.
- Never run the seed or any write against Atlas without the author asking; a local `.env` with a real `MONGODB_URI` exists.
- Accessibility baseline (Nov 21, 2026): axe-core reports zero WCAG 2.1 AA violations on all pages in dark, light and 375px views. Every page has one H1 and no skipped heading levels; horizontally scrolling tables are focusable regions.
- Research studies render as numbered cards from `data/<file>.json` → `studies[]` with `<!-- @studies <file> -->` and `<!-- @study-notes <file> -->`. Each study has a one-sentence `finding` written from its abstract, an APA 7 `apa` string (`*text*` = italics), `url`, `stages` and `notes`.
- The nav holds eight links and only just fits the 1188px content width; adding another link needs shorter labels or a different nav pattern.
- "From class" pairings live in `data/readings.json`; stage pages and their order in `data/pages.json`.
- Design tokens in `src/styles/tokens.css` (dark default, `:root.light` overrides). Text contrast: use `--t2` (.50) or brighter for any readable text; `--t-dim` only for large text; `--t3`/`--t4` are decorative only.
- Charts read colors from `src/chart-theme.js` and re-render on the `themechange` window event.
- `styleguide.html` shows every component; check it after design changes.
- Educator form (M3): `share.html` (step form, `src/classroom/form.js`, reuses the self-check step card) posts to `POST /api/submissions/educator`; `from-the-classroom.html` (`src/classroom/results.js`) reads the public `GET` summary. Answer options live once in `lib/educator-form.js` (shared by server and browser); validation, HTML stripping, the stored document and the summary are in `lib/educator.js` and tested in `tests/educator*.test.js`. The summary hides any count under 10 (and the total until 10 approved), adds a second hidden cell on one-answer charts, and never reads `contactEmail`. Both pages use `data-page="for-schools"` because the nav is full.
- Review submissions locally with `corepack pnpm educator:review` (list, `approve <id> [--quote "..."]`, `unfeature <id>`, `reject <id>`). A featured quote must be copied word for word from the response. Rate limit is shared with the outreach form (`lib/rate-limit.js`, hashed IPs, one-hour TTL); honeypot field is `homepage`.
- STEM outreach directory (M4): `outreach.html` (`src/outreach/directory.js` + `form.js`, styles in `src/styles/outreach.css`). The form markup is built at build time by `<!-- @outreach-form -->` (`lib/outreach-form.js`). Choices, filter rules (`matchesFilters`, where a state filter also matches nationwide `US` programs) and the suppressed funding summary live once in `lib/outreach-options.js`, shared by server and browser. Validation and the public allowlist (`PUBLIC_FIELDS`) are in `lib/outreach.js`. `POST /api/submissions/outreach` accepts JSON or a plain form post (303 back to `#submitted` / `#submit-error`); `GET /api/outreach` returns approved listings only, never contact details or the funding answer. Review with `corepack pnpm outreach:review` (list [status], `approve <id>`, `reject <id>`). Tests in `tests/outreach.test.js`.
- `corepack pnpm dev` serves `/api/*` through a dev middleware in `vite.config.js` (reads `MONGODB_*` and `RATE_LIMIT_SALT` from `.env`), so forms work locally without `vercel dev`.
- Both contribution routes share one set of helpers: `lib/submissions.js` (HTML stripping, honeypot field `homepage`, body parsing and 20 KB limit, 10 attempts per hour, issue shape `{path, field, message}`), `lib/rate-limit.js` (hashed-IP attempts in the `rateLimits` collection, TTL one hour) and `lib/shared-options.js` (states, `MIN_PUBLIC_COUNT = 10`, label helpers; safe in the browser). All collections, validators and indexes, including `rateLimits`, live only in `lib/schema.js`.
