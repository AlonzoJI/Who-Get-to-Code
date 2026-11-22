// GET /api/admin/pending  (signed in only)
// Pending educator submissions and outreach programs, newest first, with every
// field including contact details. This is the only route that returns them.
import { getDb } from '../../lib/mongodb.js';
import { adminJson, requireAdmin } from '../../lib/admin-auth.js';

const forPage = (doc) => ({ ...doc, _id: String(doc._id) });

export async function GET(request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const db = await getDb();
    const [educator, outreach] = await Promise.all([
      db.collection('educatorSubmissions').find({ status: 'pending' }).sort({ createdAt: -1 }).limit(500).toArray(),
      db.collection('outreachPrograms').find({ status: 'pending' }).sort({ createdAt: -1 }).limit(500).toArray(),
    ]);
    return adminJson({ educator: educator.map(forPage), outreach: outreach.map(forPage) });
  } catch (err) {
    console.error('Admin pending list error:', err.message);
    return adminJson({ error: 'Database unavailable' }, 503);
  }
}
