// Server-side rules for "Share from your classroom" submissions: validation,
// HTML stripping, the stored document, and the public summary. Pure functions
// only (no database), so every rule is unit tested in tests/educator.test.js.
import { z } from 'zod';
import {
  BARRIERS, CHANGED, COURSES, FORM_VERSION, GRADE_BANDS, LIMITS, LOCALES, MIN_PUBLIC_COUNT,
  ROLES, SECTORS, SHARE_GROUPS, SHARE_RANGES, STATES, ids, labelOf,
} from './educator-form.js';

// HTML stripping, the honeypot field and the issue shape are shared with the
// outreach form (lib/submissions.js). Re-exported so existing imports keep working.
import { HONEYPOT_FIELD, plainText, toIssues } from './submissions.js';
export { HONEYPOT_FIELD, plainText };

const enumOf = (options, message) => z.enum(ids(options), { error: message });

// Optional free text: stripped first, then length-checked on what is kept.
const text = (max) =>
  z
    .string({ error: 'Must be text' })
    .max(max * 4, `Keep this under ${max} characters`)
    .transform(plainText)
    .pipe(z.string().max(max, `Keep this under ${max} characters`))
    .optional()
    .transform((v) => v ?? '');

const multi = (options, { min = 0, message } = {}) =>
  z
    .array(enumOf(options, 'Unknown option'), { error: 'Must be a list' })
    .max(options.length)
    .transform((list) => [...new Set(list)])
    .refine((list) => list.length >= min, message ?? 'Pick at least one');

const share = enumOf(SHARE_RANGES, 'Pick a range or Not sure');

export const educatorSubmission = z
  .object({
    role: enumOf(ROLES, 'Pick your role'),
    state: enumOf(STATES, 'Pick your state'),
    schoolSector: enumOf(SECTORS, 'Pick a school type'),
    schoolLocale: enumOf(LOCALES, 'Pick rural, suburban or urban'),
    gradeBands: multi(GRADE_BANDS, { min: 1, message: 'Pick at least one grade band' }),
    courses: multi(COURSES, { min: 1, message: 'Pick at least one, or No computer science courses' }),
    coursesOther: text(LIMITS.other),
    shares: z.object(Object.fromEntries(SHARE_GROUPS.map((g) => [g.id, share])), { error: 'Answer each share question' }),
    barriers: multi(BARRIERS),
    barriersOther: text(LIMITS.other),
    changedSince2025: enumOf(CHANGED, 'Pick yes, no or not sure'),
    changeDetails: text(LIMITS.long),
    whatWorked: text(LIMITS.long),
    name: text(LIMITS.name),
    school: text(LIMITS.school),
    email: z
      .string({ error: 'Must be text' })
      .trim()
      .max(LIMITS.email)
      .pipe(z.union([z.literal(''), z.email('Enter a valid email address, or leave it blank')]))
      .optional()
      .transform((v) => (v ? v.toLowerCase() : '')),
    showNameAndSchool: z.boolean({ error: 'Must be true or false' }).optional().default(false),
    consentToPublish: z.literal(true, { error: 'Consent to publish in summary form is required' }),
  })
  .superRefine((s, ctx) => {
    if (s.courses.includes('none') && s.courses.length > 1) {
      ctx.addIssue({ code: 'custom', path: ['courses'], message: 'No computer science courses cannot be combined with a course' });
    }
    if (s.courses.includes('other') && !s.coursesOther) {
      ctx.addIssue({ code: 'custom', path: ['coursesOther'], message: 'Say which other course' });
    }
    if (s.barriers.includes('other') && !s.barriersOther) {
      ctx.addIssue({ code: 'custom', path: ['barriersOther'], message: 'Say what the other barrier is' });
    }
  });

export function validateSubmission(input) {
  const result = educatorSubmission.safeParse(input);
  if (result.success) return { data: result.data };
  return { issues: toIssues(result.error) };
}

// The document saved to MongoDB. Status is always "pending"; nothing the
// visitor sends can set it. "Other" text is dropped when "other" isn't picked.
export function buildSubmission(data, now = new Date()) {
  const name = data.name || null;
  const school = data.school || null;
  return {
    status: 'pending',
    createdAt: now,
    formVersion: FORM_VERSION,
    consentToPublish: true,
    role: data.role,
    state: data.state,
    schoolSector: data.schoolSector,
    schoolLocale: data.schoolLocale,
    gradeBands: data.gradeBands,
    courses: data.courses,
    coursesOther: data.courses.includes('other') ? data.coursesOther : null,
    shares: data.shares,
    barriers: data.barriers,
    barriersOther: data.barriers.includes('other') ? data.barriersOther : null,
    changedSince2025: data.changedSince2025,
    changeDetails: data.changeDetails || null,
    whatWorked: data.whatWorked || null,
    contact: { name, school },
    showNameAndSchool: Boolean(data.showNameAndSchool && (name || school)),
    // Private: for follow-up only. Never returned by the public API.
    contactEmail: data.email || null,
    // Set by the author with `corepack pnpm educator:review`.
    review: { reviewedAt: null, featured: false, quote: null },
  };
}

// Fields the public summary reads. An inclusion list, so contactEmail and
// anything added later stay out unless someone adds them here on purpose.
export const PUBLIC_FIELDS = {
  _id: 0, status: 1, createdAt: 1, consentToPublish: 1, role: 1, state: 1, gradeBands: 1,
  courses: 1, barriers: 1, changedSince2025: 1, contact: 1, showNameAndSchool: 1, review: 1,
};

// Counts under MIN_PUBLIC_COUNT become null. For a one-answer question the
// counts add up to the total, so if exactly one is hidden the next smallest is
// hidden too; otherwise total minus the others would reveal it.
function countRows(options, count, { singleChoice = false } = {}) {
  const rows = options.map((o) => {
    const n = count(o.id);
    return { id: o.id, label: o.label, count: n >= MIN_PUBLIC_COUNT ? n : null, raw: n };
  });
  if (singleChoice && rows.filter((r) => r.count === null).length === 1) {
    const next = rows.filter((r) => r.count !== null).sort((a, b) => a.raw - b.raw)[0];
    if (next) next.count = null;
  }
  return rows.map(({ raw, ...r }) => r);
}

const QUOTE_LIMIT = 12;

// The public summary: aggregate counts plus featured quotes. Only approved,
// consented documents should be passed in, but both are checked again here.
export function summarize(docs) {
  const shown = docs.filter((d) => d.status === 'approved' && d.consentToPublish === true);
  const total = shown.length;
  const enough = total >= MIN_PUBLIC_COUNT;
  const has = (field) => (id) => shown.filter((d) => d[field]?.includes(id)).length;
  const years = shown.map((d) => new Date(d.createdAt).getUTCFullYear()).filter(Number.isFinite);
  const byState = shown.reduce((acc, d) => ((acc[d.state] = (acc[d.state] ?? 0) + 1), acc), {});

  const quotes = shown
    .filter((d) => d.review?.featured === true && d.review?.quote)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, QUOTE_LIMIT)
    .map((d) => ({
      text: d.review.quote,
      role: labelOf(ROLES, d.role),
      gradeBands: (d.gradeBands ?? []).map((g) => labelOf(GRADE_BANDS, g)),
      // A state with few responses could point to one school, so it is left off.
      state: byState[d.state] >= MIN_PUBLIC_COUNT ? labelOf(STATES, d.state) : null,
      name: d.showNameAndSchool ? d.contact?.name ?? null : null,
      school: d.showNameAndSchool ? d.contact?.school ?? null : null,
    }));

  return {
    total: enough ? total : null,
    enough,
    minCount: MIN_PUBLIC_COUNT,
    years: years.length ? [Math.min(...years), Math.max(...years)] : null,
    label: 'Self-reported, not a representative sample',
    charts: [
      {
        id: 'courses',
        title: 'Computer Science courses schools offer',
        measure: 'Responses that chose each course. More than one answer allowed.',
        rows: countRows(COURSES, has('courses')),
      },
      {
        id: 'barriers',
        title: 'Biggest barriers to CS participation',
        measure: 'Responses that chose each barrier. More than one answer allowed.',
        rows: countRows(BARRIERS, has('barriers')),
      },
      {
        id: 'changed',
        title: 'Has anything changed since 2025 because of DEI rollbacks, funding or policy?',
        measure: 'Responses by answer. One answer each.',
        rows: countRows(CHANGED, (id) => shown.filter((d) => d.changedSince2025 === id).length, { singleChoice: true }),
      },
    ].map((c) => (enough ? c : { ...c, rows: c.rows.map((r) => ({ ...r, count: null })) })),
    quotes,
  };
}

// A featured quote must be copied word for word from the educator's own answer.
export function isVerbatim(quote, doc) {
  const q = plainText(quote);
  return q.length > 0 && [doc.whatWorked, doc.changeDetails].some((t) => t && t.includes(q));
}
