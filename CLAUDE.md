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
- All data lives in /data as JSON or CSV. Every record has source, year, url and a verified true/false flag
- Anything not yet verified renders with a visible "placeholder data" badge
- Every chart shows its source and year directly under it
- Present the rollback debate fairly. Each policy section includes a short card on what supporters of the change argue, with a cited source, next to what the outcome data shows
- Do not write my personal story or reflection copy. Leave marked placeholders
- Every section ends with a "From class" card that ties it to a course reading (I will give you the pairings in each part)

# Tech

Static site I can deploy free to GitHub Pages or Vercel. Keep it simple (plain HTML, CSS and JS or Vite). D3 or Observable Plot for charts. Responsive, keyboard accessible and readable contrast.

# Structure & conventions (agreed Nov 20, 2026)

- Vite multi-page site. Every `.html` in the repo root is a page. Run with `corepack pnpm dev`, build with `corepack pnpm build` (output in `dist/`, relative paths, so it works on GitHub Pages or Vercel).
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
- Research studies render as numbered cards from `data/<file>.json` → `studies[]` with `<!-- @studies <file> -->` and `<!-- @study-notes <file> -->`. Each study has a one-sentence `finding` written from its abstract, an APA 7 `apa` string (`*text*` = italics), `url`, `stages` and `notes`.
- The nav holds eight links and only just fits the 1188px content width; adding another link needs shorter labels or a different nav pattern.
- "From class" pairings live in `data/readings.json`; stage pages and their order in `data/pages.json`.
- Design tokens in `src/styles/tokens.css` (dark default, `:root.light` overrides). Text contrast: use `--t2` (.50) or brighter for any readable text; `--t-dim` only for large text; `--t3`/`--t4` are decorative only.
- Charts read colors from `src/chart-theme.js` and re-render on the `themechange` window event.
- `styleguide.html` shows every component; check it after design changes.
