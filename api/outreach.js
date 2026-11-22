// GET /api/outreach?state=OH&grade=high&format=summer-camp&cost=free&q=robotics
// Read-only. Returns approved STEM outreach listings only, with public fields
// only (never contact details or the private funding answer), plus a summary of
// how many listed programs report funding or partnership changes since 2025.
// Counts under 10 in that summary come back as null. All filters are optional.
import { z } from 'zod';
import { getDb } from '../lib/mongodb.js';
import { json, parseQuery, withDb } from '../lib/api.js';
import { publicListing, PUBLIC_FIELDS } from '../lib/outreach.js';
import { COST_FILTERS, FORMATS, GRADE_BANDS, REGIONS, fundingSummary, ids, matchesFilters } from '../lib/outreach-options.js';

export const outreachQuery = z.object({
  state: z.string().trim().transform((s) => s.toUpperCase()).pipe(z.enum(ids(REGIONS))).optional(),
  grade: z.enum(ids(GRADE_BANDS)).optional(),
  format: z.enum(ids(FORMATS)).optional(),
  cost: z.enum(ids(COST_FILTERS)).optional(),
  q: z.string().trim().max(100).optional(),
});

const PROJECTION = Object.fromEntries([...PUBLIC_FIELDS, 'fundingChange'].map((f) => [f, 1]));

export function GET(request) {
  const { query, error } = parseQuery(outreachQuery, request);
  if (error) return error;
  return withDb(async () => {
    const db = await getDb();
    const approved = await db
      .collection('outreachPrograms')
      .find({ status: 'approved', consentToPublish: true }, { projection: PROJECTION })
      .sort({ approvedAt: -1 })
      .limit(1000)
      .toArray();

    // The funding answer is read only to build the summary, then dropped.
    const funding = fundingSummary(approved.map((d) => d.fundingChange));
    const data = approved.map(publicListing).filter((listing) => matchesFilters(listing, query));
    const latest = approved.reduce((max, d) => (d.approvedAt > max ? d.approvedAt : max), null);

    return json({
      count: data.length,
      filters: query,
      data,
      funding: {
        ...funding,
        asOf: latest ? latest.toISOString().slice(0, 10) : null,
        selfReported: true,
        verified: false,
        source: 'Self-reported by program leaders through this directory’s form; approved listings only',
        url: '/outreach.html#list-your-program',
      },
    });
  });
}
