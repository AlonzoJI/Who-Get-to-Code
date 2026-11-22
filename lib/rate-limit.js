// Per-visitor submission limit, shared by every form route and the admin login.
// Kept in MongoDB so it holds across serverless instances. The IP is never
// stored: the key is a SHA-256 hash of RATE_LIMIT_SALT, the route bucket and the
// IP. Each attempt is one { key, createdAt } document; the TTL index in
// lib/schema.js deletes it after an hour, so windows longer than an hour are not
// supported.
//
// Record first, then count. Each attempt is inserted, then counts the attempts
// in the window up to and including its own (by _id order). A burst of
// simultaneous requests therefore can't all read "under the limit" before any
// of them is recorded: the (max + 1)th attempt always sees max + 1 and is refused.
import { createHash } from 'node:crypto';

const HOUR = 60 * 60 * 1000;

export const visitorKey = (bucket, ip) =>
  createHash('sha256')
    .update(`${process.env.RATE_LIMIT_SALT ?? ''}|${bucket}|${ip || 'unknown'}`)
    .digest('hex');

// Returns { ok: true } and records the attempt, or { ok: false, retryAfter }
// (seconds) once the visitor has made more than `max` attempts within the window.
export async function checkRateLimit(db, bucket, ip, { max = 5, windowMs = HOUR, now = Date.now() } = {}) {
  const attempts = db.collection('rateLimits');
  const key = visitorKey(bucket, ip);
  const since = new Date(now - windowMs);
  const { insertedId } = await attempts.insertOne({ key, createdAt: new Date(now) });
  const rank = await attempts.countDocuments({ key, createdAt: { $gte: since }, _id: { $lte: insertedId } });
  if (rank <= max) return { ok: true, retryAfter: 0 };

  const oldest = await attempts.findOne({ key, createdAt: { $gte: since } }, { sort: { createdAt: 1 }, projection: { _id: 0, createdAt: 1 } });
  const retryAfter = Math.max(1, Math.ceil(((oldest?.createdAt.getTime() ?? now) + windowMs - now) / 1000));
  return { ok: false, retryAfter };
}
