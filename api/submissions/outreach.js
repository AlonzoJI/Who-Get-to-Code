// POST /api/submissions/outreach
// A STEM outreach leader lists a program. The answers are validated and
// stripped of HTML here, a hidden honeypot field catches simple bots, and each
// visitor gets a limited number of attempts per hour. Every submission is saved
// with status "pending" and stays off the site until the site owner approves it.
//
// Accepts JSON (the page's script) or a regular form post (no JavaScript).
// A form post gets a 303 redirect back to the page instead of JSON.
//
// Body parsing, the honeypot, size and rate limits are shared with the educator
// route through lib/submissions.js and lib/rate-limit.js.
import { ipAddress } from '@vercel/functions';
import { getDb } from '../../lib/mongodb.js';
import { submissionDocument, validateSubmission } from '../../lib/outreach.js';
import { BODY_ERRORS, MAX_ATTEMPTS_PER_HOUR, isBot, readSubmissionBody } from '../../lib/submissions.js';
import { checkRateLimit } from '../../lib/rate-limit.js';

const PAGE = '/outreach.html';

const reply = (body, status, headers = {}) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

const redirect = (request, hash) =>
  new Response(null, { status: 303, headers: { Location: new URL(`${PAGE}${hash}`, request.url).href, 'Cache-Control': 'no-store' } });

export async function POST(request) {
  const { body, isForm, error } = await readSubmissionBody(request, { allowForm: true, multiValue: ['gradeBands', 'formats'] });
  if (error === 'bad-type') return reply({ error: 'Send the form as JSON or as a regular form post' }, 415);
  if (error) return reply({ error: BODY_ERRORS[error].error }, BODY_ERRORS[error].status);

  // Bots that fill the hidden field are told it worked, and nothing is saved.
  if (isBot(body)) {
    return isForm ? redirect(request, '#submitted') : reply({ ok: true, status: 'pending' }, 201);
  }

  let db;
  try {
    db = await getDb();
    const limit = await checkRateLimit(db, 'outreach', ipAddress(request), { max: MAX_ATTEMPTS_PER_HOUR });
    if (!limit.ok) {
      return isForm
        ? redirect(request, '#submit-error')
        : reply({ error: 'Too many submissions from this connection. Please try again later.' }, 429, { 'Retry-After': String(limit.retryAfter) });
    }
  } catch (err) {
    console.error('Outreach submission database error:', err.message);
    return isForm ? redirect(request, '#submit-error') : reply({ error: 'Submissions are unavailable right now' }, 503);
  }

  const { data, issues } = validateSubmission(body);
  if (issues) return isForm ? redirect(request, '#submit-error') : reply({ error: 'Some answers need another look', issues }, 400);

  try {
    await db.collection('outreachPrograms').insertOne(submissionDocument(data));
  } catch (err) {
    console.error('Outreach submission insert error:', err.message);
    return isForm ? redirect(request, '#submit-error') : reply({ error: 'Submissions are unavailable right now' }, 503);
  }
  return isForm ? redirect(request, '#submitted') : reply({ ok: true, status: 'pending' }, 201);
}
