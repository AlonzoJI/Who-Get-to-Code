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
import { moderate, unfeature } from '../lib/moderation.js';
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

  // Approve, reject and unfeature go through lib/moderation.js, which logs each
  // action in the moderationLog collection (same as the admin page).
  const id = args[0];
  if (!id || !ObjectId.isValid(id)) throw new Error(`Usage: educator:review ${command} <id>`);
  if (command === 'approve') {
    const at = args.indexOf('--quote');
    const quoteText = at >= 0 ? args[at + 1] : null;
    const doc = await moderate(db, { collection: 'educatorSubmissions', id, action: 'approve', quoteText, via: 'cli' });
    log(`Approved ${id}${doc.review?.featured ? ' with a quote card' : ''}.`);
    return doc;
  }
  if (command === 'unfeature') {
    const doc = await unfeature(db, id, { via: 'cli' });
    log(`Removed the quote card for ${id}.`);
    return doc;
  }
  if (command === 'reject') {
    const doc = await moderate(db, { collection: 'educatorSubmissions', id, action: 'reject', via: 'cli' });
    log(`Rejected ${id}.`);
    return doc;
  }
  throw new Error(`Unknown command "${command}". Use list, approve, unfeature or reject.`);
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
