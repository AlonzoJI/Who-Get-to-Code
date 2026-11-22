// POST /api/submissions/educator  "Share from your classroom" form.
//   Validates every field, strips HTML and saves with status "pending".
//   A filled honeypot field gets the normal success reply but nothing is saved.
// GET  /api/submissions/educator  Public summary of APPROVED submissions only:
//   aggregate counts (any count under 10 hidden) and featured quotes that had
//   consent. Never returns emails, raw submissions or ids.
//
// Body parsing, the honeypot, size and rate limits are shared with the outreach
// route through lib/submissions.js and lib/rate-limit.js.
import { ipAddress } from '@vercel/functions';
import { getDb } from '../../lib/mongodb.js';
import { json, withDb } from '../../lib/api.js';
import { buildSubmission, PUBLIC_FIELDS, summarize, validateSubmission } from '../../lib/educator.js';
import { BODY_ERRORS, MAX_ATTEMPTS_PER_HOUR, isBot, readSubmissionBody } from '../../lib/submissions.js';
import { checkRateLimit } from '../../lib/rate-limit.js';

export const RATE_LIMIT_MAX = MAX_ATTEMPTS_PER_HOUR;

const RECEIVED = { ok: true, status: 'pending', message: 'Received. It will be reviewed before anything appears on the site.' };

export async function POST(request) {
  const { body, error } = await readSubmissionBody(request);
  if (error) return json({ error: BODY_ERRORS[error].error }, BODY_ERRORS[error].status);

  if (isBot(body)) return json(RECEIVED, 201);

  return withDb(async () => {
    const db = await getDb();
    const limit = await checkRateLimit(db, 'educator', ipAddress(request), { max: RATE_LIMIT_MAX });
    if (!limit.ok) {
      return Response.json(
        { error: 'Too many submissions from this connection. Please try again later.' },
        { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(limit.retryAfter) } }
      );
    }
    const { data, issues } = validateSubmission(body);
    if (issues) return json({ error: 'Some answers need another look', issues }, 400);

    await db.collection('educatorSubmissions').insertOne(buildSubmission(data));
    return json(RECEIVED, 201);
  });
}

export function GET() {
  return withDb(async () => {
    const db = await getDb();
    const docs = await db
      .collection('educatorSubmissions')
      .find({ status: 'approved', consentToPublish: true }, { projection: PUBLIC_FIELDS })
      .toArray();
    return json(summarize(docs));
  });
}
