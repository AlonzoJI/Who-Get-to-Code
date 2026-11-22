// POST /api/admin/login  { password } → sets the signed session cookie.
// DELETE /api/admin/login → signs out.
// Five tries per hour per connection. The reply never says whether a password
// was close, and the password is never logged or echoed.
import { ipAddress } from '@vercel/functions';
import { getDb } from '../../lib/mongodb.js';
import { checkRateLimit } from '../../lib/rate-limit.js';
import { adminEnabled, adminJson, checkPassword, clearCookie, createSession, sameOrigin, sessionCookie } from '../../lib/admin-auth.js';

const MAX_TRIES_PER_HOUR = 5;

export async function POST(request) {
  if (!adminEnabled()) return adminJson({ error: 'Admin is not set up. Set ADMIN_PASSWORD (12+ characters).' }, 503);
  if (!sameOrigin(request)) return adminJson({ error: 'Cross-site request refused' }, 403);
  if (!request.headers.get('content-type')?.includes('application/json')) return adminJson({ error: 'Send JSON' }, 415);

  let body;
  try {
    body = JSON.parse((await request.text()).slice(0, 2000));
  } catch {
    return adminJson({ error: 'Could not read the request' }, 400);
  }

  try {
    const limit = await checkRateLimit(await getDb(), 'admin-login', ipAddress(request), { max: MAX_TRIES_PER_HOUR });
    if (!limit.ok) return adminJson({ error: 'Too many tries. Wait and try again.' }, 429, { 'Retry-After': String(limit.retryAfter) });
  } catch (err) {
    console.error('Admin login rate limit unavailable:', err.message);
    return adminJson({ error: 'Sign-in is unavailable right now' }, 503);
  }

  if (!checkPassword(body?.password)) return adminJson({ error: 'Wrong password' }, 401);
  return adminJson({ ok: true }, 200, { 'Set-Cookie': sessionCookie(request, createSession()) });
}

export function DELETE(request) {
  if (!sameOrigin(request)) return adminJson({ error: 'Cross-site request refused' }, 403);
  return adminJson({ ok: true }, 200, { 'Set-Cookie': clearCookie(request) });
}
