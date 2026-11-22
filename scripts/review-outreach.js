// Review STEM outreach directory submissions. Nothing appears on the site until
// it is approved here. Contact details print in this terminal only.
//
//   corepack pnpm outreach:review                 list pending submissions
//   corepack pnpm outreach:review list approved   list approved (or rejected) ones
//   corepack pnpm outreach:review approve <id>    publish a listing
//   corepack pnpm outreach:review reject <id>     keep it off the site
//
// Reads MONGODB_URI from .env.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { ObjectId } from 'mongodb';
import { getDb, closeClient } from '../lib/mongodb.js';
import { COSTS, FORMATS, FUNDING_ANSWERS, GRADE_BANDS, REGIONS, labelFor } from '../lib/outreach-options.js';

const labels = (list, values) => (values ?? []).map((v) => labelFor(list, v)).join(', ');

function describe(doc) {
  return [
    `${doc._id}  [${doc.status}]  submitted ${doc.createdAt.toISOString().slice(0, 10)}`,
    `  ${doc.programName} (${doc.organization})`,
    `  ${doc.website}`,
    `  Serves: ${labels(GRADE_BANDS, doc.gradeBands)}. ${doc.audience}`,
    `  Where: ${[doc.city, labelFor(REGIONS, doc.state)].filter(Boolean).join(', ')}`,
    `  Format: ${labels(FORMATS, doc.formats)}. Cost: ${labelFor(COSTS, doc.cost)}${doc.scholarships ? ', scholarships available' : ''}`,
    `  How to connect students: ${doc.howToConnect}`,
    `  Funding or partnerships changed since 2025 (private): ${labelFor(FUNDING_ANSWERS, doc.fundingChange)}${doc.fundingDetails ? `. ${doc.fundingDetails}` : ''}`,
    `  Contact (private): ${doc.contactName ?? ''} <${doc.contactEmail}>`,
    `  Consent to list publicly: ${doc.consentToPublish ? 'yes' : 'NO'}`,
  ].join('\n');
}

export async function review(db, [command = 'list', arg] = [], { log = console.log } = {}) {
  const programs = db.collection('outreachPrograms');
  if (command === 'list') {
    const status = arg ?? 'pending';
    const docs = await programs.find({ status }).sort({ createdAt: 1 }).toArray();
    log(docs.length ? docs.map(describe).join('\n\n') : `No ${status} submissions.`);
    return docs;
  }
  if (command === 'approve' || command === 'reject') {
    if (!arg || !ObjectId.isValid(arg)) throw new Error(`Give the id of the submission to ${command}.`);
    const _id = new ObjectId(arg);
    const doc = await programs.findOne({ _id });
    if (!doc) throw new Error(`No submission with id ${arg}.`);
    if (command === 'approve' && !doc.consentToPublish) throw new Error('This program did not agree to be listed, so it cannot be approved.');
    const update = command === 'approve' ? { status: 'approved', approvedAt: new Date() } : { status: 'rejected', approvedAt: null };
    await programs.updateOne({ _id }, { $set: update });
    log(`${command === 'approve' ? 'Approved' : 'Rejected'}: ${doc.programName} (${doc.organization})`);
    return { ...doc, ...update };
  }
  throw new Error(`Unknown command "${command}". Use list, approve or reject.`);
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
