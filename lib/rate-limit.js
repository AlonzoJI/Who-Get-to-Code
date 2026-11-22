// Per-visitor submission limit, shared by every form route. Kept in MongoDB so
// it holds across serverless instances. The IP is never stored: the key is a
// SHA-256 hash of RATE_LIMIT_SALT, the route bucket and the IP. Each attempt is
// one { key, createdAt } document; the TTL index in lib/schema.js deletes it
// after an hour, so windows longer than an hour are not supported.
import { createHash } from 'node:crypto';

const HOUR = 60 * 60 * 1000;

export const visitorKey = (bucket, ip) =>
  createHash('sha256')
    .update(`${process.env.RATE_LIMIT_SALT ?? ''}|${bucket}|${ip || 'unknown'}`)
    .digest('hex');

// Returns { ok: true } and records the attempt, or { ok: false, retryAfter }
// (seconds) once the visitor has made `max` attempts within the window.
export async function checkRateLimit(db, bucket, ip, { max = 5, windowMs = HOUR, now = Date.now() } = {}) {
  const attempts = db.collection('rateLimits');
  const key = visitorKey(bucket, ip);
  const recent = await attempts
    .find({ key, createdAt: { $gte: new Date(now - windowMs) } }, { projection: { _id: 0, createdAt: 1 } })
    .sort({ createdAt: 1 })
    .limit(max)
    .toArray();
  if (recent.length >= max) {
    const retryAfter = Math.max(1, Math.ceil((recent[0].createdAt.getTime() + windowMs - now) / 1000));
    return { ok: false, retryAfter };
  }
  await attempts.insertOne({ key, createdAt: new Date(now) });
  return { ok: true, retryAfter: 0 };
}
