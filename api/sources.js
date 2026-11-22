// GET /api/sources?type=primary&page=rollback.html
// Read-only bibliography: APA citation, primary or secondary, url, and the
// pages that use each source. Sorted alphabetically like the Methods page.
import { getDb } from '../lib/mongodb.js';
import { json, parseQuery, sourceQuery, withDb } from '../lib/api.js';

const sortKey = (apa) => apa.replace(/[*“”"'‘’]/g, '').replace(/^the /i, '').toLowerCase();

export function GET(request) {
  const { query, error } = parseQuery(sourceQuery, request);
  if (error) return error;
  return withDb(async () => {
    const db = await getDb();
    const filter = {};
    if (query.type) filter.type = query.type;
    if (query.page) filter.pages = query.page;
    const data = (await db.collection('sources').find(filter, { projection: { _id: 0, seededAt: 0, createdAt: 0 } }).toArray())
      .sort((a, b) => sortKey(a.apa).localeCompare(sortKey(b.apa)));
    return json({ count: data.length, filters: query, data });
  });
}
