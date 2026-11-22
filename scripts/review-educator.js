// Review "Share from your classroom" submissions. Nothing appears on the site
// until it is approved here. Contact details print in this terminal only.
//
//   corepack pnpm educator:review                          list pending submissions
//   corepack pnpm educator:review list approved            list approved (or rejected) ones
//   corepack pnpm educator:review approve <id>             count it in the charts
//   corepack pnpm educator:review approve <id> --quote "…" also show a quote card;
//                                                          the quote must be copied word for word
//                                                          from "What has worked" or "What changed"
//   corepack pnpm educator:review unfeature <id>           remove its quote card
//   corepack pnpm educator:review reject <id>              keep it off the site
//
// Reads MONGODB_URI from .env.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { ObjectId } from 'mongodb';
import { getDb, closeClient } from '../lib/mongodb.js';
import { isVerbatim, plainText } from '../lib/educator.js';
import {
  BARRIERS, CHANGED, COURSES, GRADE_BANDS, LOCALES, ROLES, SECTORS, SHARE_GROUPS, SHARE_RANGES, STATES, labelOf,
} from '../lib/educator-form.js';

const list = (options, values) => (values ?? []).map((v) => labelOf(options, v)).join(', ') || 'none picked';

function describe(d) {
  return [
    `${d._id}  [${d.status}]  submitted ${d.createdAt.toISOString().slice(0, 10)}`,
    `  ${labelOf(ROLES, d.role)}, ${labelOf(STATES, d.state)}. ${labelOf(SECTORS, d.schoolSector)}, ${labelOf(LOCALES, d.schoolLocale)}. Grades ${list(GRADE_BANDS, d.gradeBands)}`,
    `  Courses: ${list(COURSES, d.courses)}${d.coursesOther ? ` (other: ${d.coursesOther})` : ''}`,
    `  Shares: ${SHARE_GROUPS.map((g) => `${g.label} ${labelOf(SHARE_RANGES, d.shares?.[g.id])}`).join('; ')}`,
    `  Barriers: ${list(BARRIERS, d.barriers)}${d.barriersOther ? ` (other: ${d.barriersOther})` : ''}`,
    `  Changed since 2025: ${labelOf(CHANGED, d.changedSince2025)}${d.changeDetails ? `\n    What changed: ${d.changeDetails}` : ''}`,
    `  What has worked: ${d.whatWorked ?? '(blank)'}`,
    `  Name and school (${d.showNameAndSchool ? 'may be shown' : 'private'}): ${d.contact?.name ?? '-'}, ${d.contact?.school ?? '-'}`,
    `  Email (private): ${d.contactEmail ?? '-'}`,
    d.review?.featured ? `  Quote card: "${d.review.quote}"` : '',
  ].filter(Boolean).join('\n');
}

export async function review(db, [command = 'list', ...args], log = console.log) {
  const subs = db.collection('educatorSubmissions');
  if (command === 'list') {
    const status = args[0] ?? 'pending';
    const docs = await subs.find({ status }).sort({ createdAt: 1 }).toArray();
    log(docs.length ? docs.map(describe).join('\n\n') : `No ${status} submissions.`);
    return docs;
  }

  const id = args[0];
  if (!id || !ObjectId.isValid(id)) throw new Error(`Usage: educator:review ${command} <id>`);
  const _id = new ObjectId(id);
  const doc = await subs.findOne({ _id });
  if (!doc) throw new Error(`No submission ${id}`);
  const now = new Date();

  if (command === 'approve') {
    const at = args.indexOf('--quote');
    const quote = at >= 0 ? plainText(args[at + 1]) : null;
    if (at >= 0 && !isVerbatim(quote, doc)) {
      throw new Error('That quote is not copied word for word from this response. Nothing was changed.');
    }
    const review = { reviewedAt: now, featured: Boolean(quote), quote: quote || null };
    await subs.updateOne({ _id }, { $set: { status: 'approved', review } });
    log(`Approved ${id}${quote ? ' with a quote card' : ''}.`);
  } else if (command === 'unfeature') {
    await subs.updateOne({ _id }, { $set: { 'review.featured': false, 'review.quote': null, 'review.reviewedAt': now } });
    log(`Removed the quote card for ${id}.`);
  } else if (command === 'reject') {
    await subs.updateOne({ _id }, { $set: { status: 'rejected', review: { reviewedAt: now, featured: false, quote: null } } });
    log(`Rejected ${id}.`);
  } else {
    throw new Error(`Unknown command "${command}". Use list, approve, unfeature or reject.`);
  }
  return subs.findOne({ _id });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await review(await getDb(), process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await closeClient();
  }
}
