// GET /api/admin/export  (signed in only)
// Downloads every approved educator submission and outreach program as JSON, all
// fields included, so the author keeps a backup. Never cached.
import { getDb } from '../../lib/mongodb.js';
import { adminJson, requireAdmin } from '../../lib/admin-auth.js';

export async function GET(request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const db = await getDb();
    const [educatorSubmissions, outreachPrograms] = await Promise.all([
      db.collection('educatorSubmissions').find({ status: 'approved' }).sort({ createdAt: 1 }).toArray(),
      db.collection('outreachPrograms').find({ status: 'approved' }).sort({ createdAt: 1 }).toArray(),
    ]);
    const exportedAt = new Date().toISOString();
    const body = JSON.stringify({ exportedAt, counts: { educatorSubmissions: educatorSubmissions.length, outreachPrograms: outreachPrograms.length }, educatorSubmissions, outreachPrograms }, null, 2);
    return new Response(body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="approved-submissions-${exportedAt.slice(0, 10)}.json"`,
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  } catch (err) {
    console.error('Admin export error:', err.message);
    return adminJson({ error: 'Database unavailable' }, 503);
  }
}
