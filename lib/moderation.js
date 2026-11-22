// Approve, reject and edit for both contribution collections, in one place.
// Used by the admin page (/api/admin/moderate) and the review scripts, and
// every action is written to the moderationLog collection with a timestamp.
import { ObjectId } from 'mongodb';
import { LIMITS } from './educator-form.js';
import { plainText } from './submissions.js';
import { isVerbatim } from './educator.js';

export const COLLECTIONS = { educator: 'educatorSubmissions', outreach: 'outreachPrograms' };

// Free-text fields the reviewer may fix typos in, with their length limits.
// Choices (state, grades, courses and so on) are not editable: they came from
// the form's fixed options.
export const EDITABLE = {
  educatorSubmissions: {
    coursesOther: LIMITS.other,
    barriersOther: LIMITS.other,
    changeDetails: LIMITS.long,
    whatWorked: LIMITS.long,
    'contact.name': LIMITS.name,
    'contact.school': LIMITS.school,
  },
  outreachPrograms: {
    programName: 120,
    organization: 120,
    audience: 600,
    city: 80,
    howToConnect: 1000,
    fundingDetails: 1000,
    contactName: 120,
  },
};

// Educator answers that can be shown as a quote card, whole and word for word.
export const QUOTE_FIELDS = ['whatWorked', 'changeDetails'];

// Fields that may not end up empty after an edit.
const REQUIRED_TEXT = new Set(['programName', 'organization', 'audience', 'howToConnect']);

export class ModerationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const get = (doc, path) => path.split('.').reduce((v, k) => v?.[k], doc);

// Cleans the reviewer's edits: only known text fields, HTML stripped, within limits.
export function cleanEdits(collection, edits = {}) {
  const allowed = EDITABLE[collection];
  const set = {};
  for (const [field, raw] of Object.entries(edits ?? {})) {
    if (!(field in allowed)) throw new ModerationError(`"${field}" can't be edited`);
    if (raw != null && typeof raw !== 'string') throw new ModerationError(`"${field}" must be text`);
    const value = plainText(raw ?? '');
    if (value.length > allowed[field]) throw new ModerationError(`"${field}" must be under ${allowed[field]} characters`);
    if (!value && REQUIRED_TEXT.has(field)) throw new ModerationError(`"${field}" can't be empty`);
    set[field] = value || null;
  }
  return set;
}

async function log(db, entry) {
  await db.collection('moderationLog').insertOne({ at: new Date(), ...entry });
}

/**
 * action: 'approve' | 'reject' | 'edit'
 * edits: { field: text } applied first (any action), each change logged as 'edit'
 * quoteField: educator approve only; one of QUOTE_FIELDS or null for no quote
 * quoteText: optional excerpt (review script); must be copied word for word from
 *   one of the quote fields, and that field becomes quoteField
 */
export async function moderate(db, { collection, id, action, edits, quoteField = null, quoteText = null, via = 'admin-page' }) {
  if (!Object.values(COLLECTIONS).includes(collection)) throw new ModerationError('Unknown collection');
  if (!['approve', 'reject', 'edit'].includes(action)) throw new ModerationError('Unknown action');
  if (!ObjectId.isValid(id)) throw new ModerationError('Not a valid id');
  const _id = new ObjectId(id);
  const items = db.collection(collection);
  const doc = await items.findOne({ _id });
  if (!doc) throw new ModerationError('No submission with that id', 404);

  // 1. Typo fixes, logged with before and after for each field that changed.
  const set = cleanEdits(collection, edits);
  const changes = Object.entries(set)
    .filter(([field, after]) => (get(doc, field) ?? null) !== after)
    .map(([field, after]) => ({ field, before: get(doc, field) ?? null, after }));
  if (changes.length) {
    await items.updateOne({ _id }, { $set: Object.fromEntries(changes.map((c) => [c.field, c.after])) });
    await log(db, { action: 'edit', collection, itemId: _id, via, fromStatus: doc.status, toStatus: doc.status, changes });
  }
  if (action === 'edit') return items.findOne({ _id });

  const current = await items.findOne({ _id });
  const now = new Date();
  let update;

  if (action === 'approve') {
    if (current.consentToPublish !== true) throw new ModerationError('This submission did not consent to publishing, so it cannot be approved');
    if (collection === 'educatorSubmissions') {
      let quote = null;
      if (quoteText) {
        const excerpt = plainText(quoteText);
        if (!isVerbatim(excerpt, current)) throw new ModerationError('That quote is not copied word for word from this response');
        quoteField = QUOTE_FIELDS.find((f) => current[f]?.includes(excerpt));
        quote = excerpt;
      } else {
        if (quoteField !== null && !QUOTE_FIELDS.includes(quoteField)) throw new ModerationError('Pick "What has worked", "What changed" or no quote');
        quote = quoteField ? current[quoteField] : null;
      }
      if (quoteField && !quote) throw new ModerationError('That answer is empty, so it cannot be the quote');
      update = { status: 'approved', review: { reviewedAt: now, featured: Boolean(quote), quote: quote ?? null, quoteField: quote ? quoteField : null } };
    } else {
      update = { status: 'approved', approvedAt: now };
    }
  } else {
    update = collection === 'educatorSubmissions'
      ? { status: 'rejected', review: { reviewedAt: now, featured: false, quote: null, quoteField: null } }
      : { status: 'rejected', approvedAt: null };
  }

  await items.updateOne({ _id }, { $set: update });
  await log(db, {
    action, collection, itemId: _id, via, fromStatus: current.status, toStatus: update.status,
    quoteField: action === 'approve' && collection === 'educatorSubmissions' ? update.review.quoteField : null,
  });
  return items.findOne({ _id });
}

// Removes an approved educator response's quote card (review script). Logged as an edit.
export async function unfeature(db, id, { via = 'cli' } = {}) {
  if (!ObjectId.isValid(id)) throw new ModerationError('Not a valid id');
  const _id = new ObjectId(id);
  const items = db.collection('educatorSubmissions');
  const doc = await items.findOne({ _id });
  if (!doc) throw new ModerationError('No submission with that id', 404);
  await items.updateOne({ _id }, { $set: { 'review.featured': false, 'review.quote': null, 'review.quoteField': null, 'review.reviewedAt': new Date() } });
  await log(db, {
    action: 'edit', collection: 'educatorSubmissions', itemId: _id, via, fromStatus: doc.status, toStatus: doc.status,
    changes: [{ field: 'review.quote', before: doc.review?.quote ?? null, after: null }],
  });
  return items.findOne({ _id });
}
