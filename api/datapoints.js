// GET /api/datapoints?stage=4&group=black&state=OH&year=2025
// Read-only. Returns published statistics with their source, year, url and
// verified flag. All filters are optional.
import { getDb } from '../lib/mongodb.js';
import { datapointFilter, datapointQuery, json, parseQuery, withDb } from '../lib/api.js';

// seededAt is kept so the Methods page can say when the database was last loaded.
const PROJECTION = { _id: 0, createdAt: 0 };

export function GET(request) {
  const { query, error } = parseQuery(datapointQuery, request);
  if (error) return error;
  return withDb(async () => {
    const db = await getDb();
    const data = await db
      .collection('datapoints')
      .find(datapointFilter(query), { projection: PROJECTION })
      .sort({ pipelineStage: 1, sourceFile: 1, recordId: 1 })
      .limit(1000)
      .toArray();
    return json({ count: data.length, filters: query, data });
  });
}
