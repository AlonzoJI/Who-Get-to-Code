// Server side of the STEM outreach directory: validating a submission, turning
// it into a stored document, and the public shape of an approved listing.
import { z } from 'zod';
import { COSTS, FORMATS, FUNDING_ANSWERS, GRADE_BANDS, REGIONS, ids } from './outreach-options.js';

// HTML stripping, the honeypot field and the issue shape are shared with the
// educator form (lib/submissions.js). stripHtml is kept as an alias for existing imports.
import { HONEYPOT_FIELD, plainText, toIssues } from './submissions.js';
export { HONEYPOT_FIELD };
export const stripHtml = plainText;

const text = (max, { min = 1 } = {}) =>
  z.preprocess(
    (v) => (v == null ? '' : stripHtml(v)),
    min ? z.string().min(min, 'This field is required').max(max, `Keep this under ${max} characters`) : z.string().max(max, `Keep this under ${max} characters`)
  );

const optionalText = (max) => text(max, { min: 0 }).transform((v) => v || null);

// A list from a form (one value or many) or from JSON (an array).
const choices = (allowed, message) =>
  z.preprocess(
    (v) => (v == null || v === '' ? [] : [].concat(v)),
    z.array(z.enum(allowed)).min(1, message).transform((list) => [...new Set(list)])
  );

const checkbox = z.preprocess((v) => v === true || v === 'on' || v === 'yes' || v === 'true', z.boolean());

// Accepts "example.org" and adds https:// so people don't have to type it.
const website = z.preprocess(
  (v) => {
    const s = v == null ? '' : stripHtml(v);
    return s && !/^[a-z][a-z0-9+.-]*:/i.test(s) ? `https://${s}` : s;
  },
  z
    .url({ protocol: /^https?$/, hostname: /^[^.]+(\.[^.]+)+$/, message: 'Enter a full web address, like https://example.org' })
    .max(300)
);

export const outreachSubmission = z.object({
  programName: text(120),
  organization: text(120),
  website,
  gradeBands: choices(ids(GRADE_BANDS), 'Choose at least one grade band'),
  audience: text(600),
  state: z.enum(ids(REGIONS), { message: 'Choose a state, or Nationwide (online)' }),
  city: optionalText(80),
  formats: choices(ids(FORMATS), 'Choose at least one format'),
  cost: z.enum(ids(COSTS), { message: 'Choose what the program costs' }),
  scholarships: checkbox.default(false),
  howToConnect: text(1000),
  fundingChange: z.enum(ids(FUNDING_ANSWERS), { message: 'Choose yes, no or not sure' }),
  fundingDetails: optionalText(1000),
  contactName: text(120),
  contactEmail: z.preprocess(
    (v) => (v == null ? '' : stripHtml(v).toLowerCase()),
    z.email({ message: 'Enter an email address we can reach you at' }).max(254)
  ),
  consentToPublish: checkbox.refine((v) => v === true, 'You must agree before the program can be listed'),
});


export function validateSubmission(body) {
  const result = outreachSubmission.safeParse(body ?? {});
  if (result.success) return { data: result.data };
  return { issues: toIssues(result.error) };
}

export function submissionDocument(data, now = new Date()) {
  return {
    ...data,
    status: 'pending',
    createdAt: now,
    approvedAt: null,
    source: 'Self-reported through the outreach directory form',
    verified: false,
  };
}

// The only fields an approved listing ever shows. This is an allowlist, so a new
// private field added later stays private unless someone adds it here on purpose.
// Contact details and the funding answer are never public; the funding answer
// only appears inside the suppressed summary counts.
export const PUBLIC_FIELDS = [
  'programName',
  'organization',
  'website',
  'gradeBands',
  'audience',
  'state',
  'city',
  'formats',
  'cost',
  'scholarships',
  'howToConnect',
  'approvedAt',
];

export function publicListing(doc) {
  const out = { id: String(doc._id) };
  for (const key of PUBLIC_FIELDS) out[key] = doc[key] ?? null;
  return out;
}
