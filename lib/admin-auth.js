// Admin login and session for /admin. Server only.
//
// - The password lives only in the ADMIN_PASSWORD environment variable and is
//   never sent to the browser. Comparison is constant-time.
// - A session is an HMAC-signed cookie: v1.<expires>.<nonce>.<signature>. The
//   signing key is derived from ADMIN_PASSWORD, so changing the password signs
//   every session out. The cookie is HttpOnly, SameSite=Strict, Secure (except on
//   http://localhost) and only sent to /api/admin.
// - Requests that change data must come from this site's own origin.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const COOKIE = 'wgc_admin';
export const SESSION_SECONDS = 8 * 60 * 60;
const COOKIE_PATH = '/api/admin';

const password = () => process.env.ADMIN_PASSWORD ?? '';
export const adminEnabled = () => password().length >= 12;

const signingKey = () => createHmac('sha256', password()).update('wgc-admin-session-v1').digest();
const sign = (payload) => createHmac('sha256', signingKey()).update(payload).digest('base64url');

const sameBytes = (a, b) => {
  const x = createHash('sha256').update(String(a)).digest();
  const y = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(x, y);
};

export const checkPassword = (attempt) => adminEnabled() && typeof attempt === 'string' && sameBytes(attempt, password());

export function createSession(now = Date.now()) {
  const payload = `v1.${Math.floor(now / 1000) + SESSION_SECONDS}.${randomBytes(12).toString('base64url')}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySession(token, now = Date.now()) {
  if (!adminEnabled() || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return false;
  const payload = parts.slice(0, 3).join('.');
  if (!sameBytes(parts[3], sign(payload))) return false;
  return Number(parts[1]) * 1000 > now;
}

export function readCookie(request, name = COOKIE) {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

const isLocalHttp = (request) => {
  const { protocol, hostname } = new URL(request.url);
  return protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1');
};

export function sessionCookie(request, token) {
  return [`${COOKIE}=${token}`, `Path=${COOKIE_PATH}`, `Max-Age=${SESSION_SECONDS}`, 'HttpOnly', 'SameSite=Strict', isLocalHttp(request) ? '' : 'Secure']
    .filter(Boolean)
    .join('; ');
}

export function clearCookie(request) {
  return [`${COOKIE}=`, `Path=${COOKIE_PATH}`, 'Max-Age=0', 'HttpOnly', 'SameSite=Strict', isLocalHttp(request) ? '' : 'Secure']
    .filter(Boolean)
    .join('; ');
}

const PRIVATE = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };

export const adminJson = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { ...PRIVATE, ...headers } });

// A browser always sends Origin on POST; it must match this site.
export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return origin === new URL(request.url).origin;
}

// Returns a Response to send back if the request is not allowed, otherwise null.
export function requireAdmin(request, { write = false } = {}) {
  if (!adminEnabled()) return adminJson({ error: 'Admin is not set up. Set ADMIN_PASSWORD (12+ characters).' }, 503);
  if (write && !sameOrigin(request)) return adminJson({ error: 'Cross-site request refused' }, 403);
  if (!verifySession(readCookie(request))) return adminJson({ error: 'Please sign in' }, 401);
  return null;
}
