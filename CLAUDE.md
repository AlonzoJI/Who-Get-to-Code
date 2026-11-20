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
- "From class" pairings live in `data/readings.json`; stage pages and their order in `data/pages.json`.
- Design tokens in `src/styles/tokens.css` (dark default, `:root.light` overrides). Text contrast: use `--t2` (.50) or brighter for any readable text; `--t-dim` only for large text; `--t3`/`--t4` are decorative only.
- Charts read colors from `src/chart-theme.js` and re-render on the `themechange` window event.
- `styleguide.html` shows every component; check it after design changes.
