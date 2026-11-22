// Shared helpers for the read-only API routes in /api.
import { z } from 'zod';

const CACHE = 'public, s-maxage=300, stale-while-revalidate=86400';

export const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': status === 200 ? CACHE : 'no-store' },
  });

// Query parameters for GET /api/datapoints. Unknown parameters are ignored.
export const datapointQuery = z.object({
  stage: z.coerce.number().int().min(1).max(6).optional(),
  group: z.string().trim().min(1).max(80).optional(),
  state: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, 'state must be a two-letter code')
    .transform((s) => s.toUpperCase())
    .optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
});

export const sourceQuery = z.object({
  type: z.enum(['primary', 'secondary']).optional(),
  page: z.string().trim().regex(/^[\w-]+\.html$/).optional(),
});

export function parseQuery(schema, request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const result = schema.safeParse(params);
  if (!result.success) {
    return { error: json({ error: 'Invalid query', issues: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, 400) };
  }
  return { query: result.data };
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function datapointFilter({ stage, group, state, year }) {
  const filter = {};
  if (stage) filter.pipelineStage = stage;
  if (year) filter.year = year;
  if (state) filter['geography.state'] = state;
  if (group) {
    // Matches the label ("Black") or any group dimension value ("black", "low-income").
    const exact = new RegExp(`^${escapeRegex(group)}$`, 'i');
    filter.$or = [
      { 'group.label': exact },
      { 'group.race': exact },
      { 'group.gender': exact },
      { 'group.income': exact },
    ];
  }
  return filter;
}

// Database problems become a 503 so the site knows to fall back to /data.
export async function withDb(fn) {
  try {
    return await fn();
  } catch (err) {
    console.error('API database error:', err.message);
    return json({ error: 'Data service unavailable' }, 503);
  }
}
