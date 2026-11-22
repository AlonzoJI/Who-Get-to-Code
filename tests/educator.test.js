import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validAnswers } from './educator-fixtures.js';
import { buildSubmission, isVerbatim, plainText, summarize, validateSubmission } from '../lib/educator.js';


test('plainText strips tags, scripts and comments but keeps the words', () => {
  assert.equal(plainText('<b>Hello</b> <i>there</i>'), 'Hello there');
  assert.equal(plainText('ok<script>alert(1)</script>done'), 'ok done');
  assert.equal(plainText('a <!-- hidden --> b'), 'a b');
  assert.equal(plainText('<img src=x onerror=alert(1)>text'), 'text');
  assert.equal(plainText('fewer than 3 < 5 girls'), 'fewer than 3 < 5 girls');
  assert.equal(plainText('line one\r\n\r\n\r\n\r\nline two'), 'line one\n\nline two');
});

test('a complete answer set validates and HTML is stripped from text', () => {
  const { data, issues } = validateSubmission({ ...validAnswers(), whatWorked: '<p>Open <b>labs</b></p>' });
  assert.equal(issues, undefined);
  assert.equal(data.whatWorked, 'Open labs');
  assert.equal(data.showNameAndSchool, false);
});

test('every required question is checked on the server', () => {
  const { issues } = validateSubmission({});
  const paths = issues.map((i) => i.path);
  for (const p of ['role', 'state', 'schoolSector', 'schoolLocale', 'gradeBands', 'courses', 'shares', 'changedSince2025', 'consentToPublish']) {
    assert.ok(paths.includes(p), `missing check for ${p}`);
  }
});

test('rejects unknown options, bad email, missing consent and "none" mixed with a course', () => {
  const bad = (patch) => validateSubmission({ ...validAnswers(), ...patch }).issues?.map((i) => i.path) ?? [];
  assert.deepEqual(bad({ role: 'principal' }), ['role']);
  assert.deepEqual(bad({ state: 'ZZ' }), ['state']);
  assert.deepEqual(bad({ courses: ['none', 'ap-csa'] }), ['courses']);
  assert.deepEqual(bad({ courses: ['other'] }), ['coursesOther']);
  assert.deepEqual(bad({ barriers: ['other'], barriersOther: '<b></b>' }), ['barriersOther']);
  assert.deepEqual(bad({ email: 'not-an-email' }), ['email']);
  assert.deepEqual(bad({ consentToPublish: false }), ['consentToPublish']);
  assert.deepEqual(bad({ shares: { girls: 'under-25' } }), ['shares.studentsOfColor', 'shares.lowIncome']);
  assert.deepEqual(bad({ whatWorked: 'x'.repeat(2001) }), ['whatWorked']);
});

test('the stored document is always pending and ignores fields the visitor should not set', () => {
  const { data } = validateSubmission({ ...validAnswers(), status: 'approved', review: { featured: true }, email: 'T@School.org ' });
  const doc = buildSubmission(data);
  assert.equal(doc.status, 'pending');
  assert.equal(doc.review.featured, false);
  assert.equal(doc.contactEmail, 't@school.org');
  assert.equal(doc.showNameAndSchool, false);
  assert.equal(doc.coursesOther, null);
});

test('showNameAndSchool only sticks when a name or school was given', () => {
  const none = buildSubmission(validateSubmission({ ...validAnswers(), showNameAndSchool: true }).data);
  assert.equal(none.showNameAndSchool, false);
  const named = buildSubmission(validateSubmission({ ...validAnswers(), showNameAndSchool: true, name: 'Ms. Rivera' }).data);
  assert.equal(named.showNameAndSchool, true);
});

const approved = (patch = {}) => ({
  ...buildSubmission(validateSubmission({ ...validAnswers(), ...patch }).data, new Date('2026-10-01')),
  status: 'approved',
});

test('summary hides every count under 10, and the total, until there are 10 responses', () => {
  const s = summarize(Array.from({ length: 9 }, () => approved()));
  assert.equal(s.enough, false);
  assert.equal(s.total, null);
  assert.ok(s.charts.every((c) => c.rows.every((r) => r.count === null)));
});

test('summary counts approved answers and suppresses small cells', () => {
  const docs = [
    ...Array.from({ length: 12 }, () => approved()),
    ...Array.from({ length: 3 }, () => approved({ courses: ['none'], changedSince2025: 'no' })),
    { ...approved(), status: 'pending' },
  ];
  const s = summarize(docs);
  assert.equal(s.total, 15);
  const row = (chart, id) => s.charts.find((c) => c.id === chart).rows.find((r) => r.id === id);
  assert.equal(row('courses', 'ap-csa').count, 12);
  assert.equal(row('courses', 'none').count, null);
  assert.equal(row('barriers', 'scheduling').count, 15);
  assert.equal(s.label, 'Self-reported, not a representative sample');
  assert.deepEqual(s.years, [2026, 2026]);
});

test('a one-answer chart never leaves a single hidden cell that the total would reveal', () => {
  const docs = [
    ...Array.from({ length: 20 }, () => approved({ changedSince2025: 'yes' })),
    ...Array.from({ length: 11 }, () => approved({ changedSince2025: 'no' })),
    ...Array.from({ length: 4 }, () => approved({ changedSince2025: 'not-sure' })),
  ];
  const rows = summarize(docs).charts.find((c) => c.id === 'changed').rows;
  assert.deepEqual(rows.map((r) => r.count), [20, null, null]);
});

test('quotes need approval, consent and a featured quote; names only with permission; small states hidden', () => {
  const featured = (patch) => ({ ...approved(patch), review: { featured: true, quote: 'Inviting every student', reviewedAt: new Date() } });
  const docs = [
    featured({ name: 'Ms. Rivera', school: 'Lincoln High', showNameAndSchool: true }),
    featured({ name: 'Mr. Chen', school: 'Hidden High' }),
    { ...featured(), consentToPublish: false },
    { ...featured(), status: 'pending' },
    approved(),
  ];
  const { quotes } = summarize(docs);
  assert.equal(quotes.length, 2);
  assert.equal(quotes[0].name ?? quotes[1].name, 'Ms. Rivera');
  assert.ok(quotes.some((q) => q.name === null && q.school === null));
  assert.ok(quotes.every((q) => q.state === null));
  assert.ok(!JSON.stringify(quotes).includes('@'));
});

test('featured quotes must be copied word for word from the response', () => {
  const doc = approved();
  assert.equal(isVerbatim('every student in Algebra I', doc), true);
  assert.equal(isVerbatim('lost its grant', doc), true);
  assert.equal(isVerbatim('every student loved it', doc), false);
  assert.equal(isVerbatim('', doc), false);
});
