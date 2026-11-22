// Server side of the STEM outreach directory: validating a submission, turning
// it into a stored document, and the public shape of an approved listing.
import { z } from 'zod';
import { COSTS, FORMATS, FUNDING_ANSWERS, GRADE_BANDS, REGIONS, ids } from './outreach-options.js';

// Removes HTML from free text. Script and style blocks go with their contents,
// every other tag is dropped, and control characters are removed. Line breaks
// are kept so longer answers stay readable. The page also renders all text with
// textContent, so this is a second layer, not the only one.
export function stripHtml(value) {
  return String(value)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?[a-z!][^>]*>/gi, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

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

// The form's hidden trap field. People never see it; simple bots fill it in.
export const HONEYPOT_FIELD = 'homepage';

export function validateSubmission(body) {
  const result = outreachSubmission.safeParse(body ?? {});
  if (result.success) return { data: result.data };
  const issues = result.error.issues.map((i) => ({ field: String(i.path[0] ?? ''), message: i.message }));
  return { issues };
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
