// GET /api/admin/session → 200 if the session cookie is valid, 401 if not.
import { adminJson, requireAdmin } from '../../lib/admin-auth.js';

export function GET(request) {
  return requireAdmin(request) ?? adminJson({ ok: true });
}
