// STEM outreach directory: validation, privacy and the public API.
// API tests run against a throwaway MongoDB (mongodb-memory-server).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { stripHtml, validateSubmission, publicListing } from '../lib/outreach.js';
import { fundingSummary, matchesFilters } from '../lib/outreach-options.js';

const valid = () => ({
  programName: 'Code Club',
  organization: 'Example Library',
  website: 'example.org/code-club',
  gradeBands: ['high'],
  audience: 'Any high school student in the county',
  state: 'OH',
  city: 'Columbus',
  formats: ['after-school', 'online'],
  cost: 'free',
  scholarships: false,
  howToConnect: 'Email the librarian or send students to the sign-up page',
  fundingChange: 'yes',
  fundingDetails: 'A federal grant ended in 2025',
  contactName: 'Pat Lee',
  contactEmail: 'Pat@Example.org',
  consentToPublish: true,
});

// ── pure logic ─────────────────────────────────────────────
test('stripHtml removes tags, scripts and control characters but keeps line breaks', () => {
  assert.equal(stripHtml('<b>Robotics</b> club<script>alert(1)</script>'), 'Robotics club');
  assert.equal(stripHtml('<img src=x onerror=alert(1)>Hi'), 'Hi');
  assert.equal(stripHtml('Grades 9 < 12 and 3 > 2'), 'Grades 9 < 12 and 3 > 2');
  assert.equal(stripHtml('Line one\r\n\r\n\r\nLine   two\u0007'), 'Line one\n\nLine two');
});

test('a valid submission is cleaned and normalized', () => {
  const { data, issues } = validateSubmission({ ...valid(), programName: '<i>Code</i> Club', gradeBands: ['high', 'high'] });
  assert.equal(issues, undefined);
  assert.equal(data.programName, 'Code Club');
  assert.equal(data.website, 'https://example.org/code-club');
  assert.equal(data.contactEmail, 'pat@example.org');
  assert.deepEqual(data.gradeBands, ['high']);
});

test('form posts send single values and "on" checkboxes', () => {
  const { data } = validateSubmission({ ...valid(), gradeBands: 'middle', scholarships: 'on', consentToPublish: 'on', city: '' });
  assert.deepEqual(data.gradeBands, ['middle']);
  assert.equal(data.scholarships, true);
  assert.equal(data.city, null);
});

test('consent is required and bad answers are reported by field', () => {
  const { issues } = validateSubmission({
    ...valid(),
    consentToPublish: false,
    website: 'javascript:alert(1)',
    contactEmail: 'nope',
    formats: [],
    cost: 'expensive',
    state: 'ZZ',
    programName: '<script>x</script>',
  });
  const fields = issues.map((i) => i.field).sort();
  assert.deepEqual(fields, ['consentToPublish', 'contactEmail', 'cost', 'formats', 'programName', 'state', 'website']);
});

test('the public shape never includes contact details or the funding answer', () => {
  const listing = publicListing({ _id: 'abc', ...valid(), status: 'approved' });
  for (const key of ['contactName', 'contactEmail', 'fundingChange', 'fundingDetails', 'status', 'consentToPublish']) {
    assert.ok(!(key in listing), `${key} must not be public`);
  }
  assert.equal(listing.programName, 'Code Club');
});

test('funding summary hides counts under 10, plus the next smallest when only one is hidden', () => {
  const answers = (yes, no, notSure) => [...Array(yes).fill('yes'), ...Array(no).fill('no'), ...Array(notSure).fill('not-sure')];
  const shown = (s) => Object.fromEntries(s.rows.map((r) => [r.answer, r.count]));

  assert.deepEqual(shown(fundingSummary(answers(12, 15, 10))), { yes: 12, no: 15, 'not-sure': 10 });
  // Only "not sure" is small, so the smaller of the others is hidden too.
  assert.deepEqual(shown(fundingSummary(answers(12, 15, 3))), { yes: null, no: 15, 'not-sure': null });
  assert.deepEqual(shown(fundingSummary(answers(4, 20, 2))), { yes: null, no: 20, 'not-sure': null });
  assert.deepEqual(shown(fundingSummary(answers(2, 1, 0))), { yes: null, no: null, 'not-sure': null });
  assert.equal(fundingSummary([]).total, 0);
});

test('filters: a state also matches nationwide programs, and cost can match scholarships', () => {
  const ohio = { ...valid(), state: 'OH' };
  const national = { ...valid(), state: 'US', cost: 'paid', scholarships: true };
  assert.ok(matchesFilters(ohio, { state: 'OH' }));
  assert.ok(matchesFilters(national, { state: 'OH' }));
  assert.ok(!matchesFilters(ohio, { state: 'MI' }));
  assert.ok(matchesFilters(national, { cost: 'scholarships' }));
  assert.ok(!matchesFilters(ohio, { cost: 'scholarships' }));
  assert.ok(matchesFilters(ohio, { grade: 'high', format: 'online', cost: 'free', q: 'library code' }));
  assert.ok(!matchesFilters(ohio, { q: 'robotics' }));
});

// ── API against a real database ───────────────────────────
let server;
let db;
let postOutreach;
let getOutreach;
let review;

before(async () => {
  server = await MongoMemoryServer.create();
  process.env.MONGODB_URI = server.getUri();
  process.env.MONGODB_DB = 'wgc-outreach-test';
  const mongo = await import('../lib/mongodb.js');
  db = await mongo.getDb();
  const { ensureSchema } = await import('../lib/schema.js');
  await ensureSchema(db);
  ({ POST: postOutreach } = await import('../api/submissions/outreach.js'));
  ({ GET: getOutreach } = await import('../api/outreach.js'));
  ({ review } = await import('../scripts/review-outreach.js'));
});

after(async () => {
  const mongo = await import('../lib/mongodb.js');
  await mongo.closeClient();
  await server?.stop();
});

let ipCounter = 0;
const post = (body, { ip = `10.0.0.${++ipCounter}`, type = 'json' } = {}) =>
  postOutreach(
    new Request('http://localhost/api/submissions/outreach', {
      method: 'POST',
      headers: {
        'content-type': type === 'json' ? 'application/json' : 'application/x-www-form-urlencoded',
        'x-real-ip': ip,
      },
      body: type === 'json' ? JSON.stringify(body) : new URLSearchParams(body).toString(),
    })
  );
const get = async (path = '/api/outreach') => {
  const res = await getOutreach(new Request(`http://localhost${path}`));
  return { status: res.status, body: await res.json() };
};
const quiet = { log: () => {} };

test('POST saves a pending submission and GET does not show it', async () => {
  const res = await post(valid());
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { ok: true, status: 'pending' });
  const saved = await db.collection('outreachPrograms').findOne({ programName: 'Code Club' });
  assert.equal(saved.status, 'pending');
  assert.equal(saved.contactEmail, 'pat@example.org');
  assert.equal((await get()).body.count, 0);
});

test('POST rejects invalid answers with field-level issues and saves nothing', async () => {
  const before = await db.collection('outreachPrograms').countDocuments();
  const res = await post({ ...valid(), consentToPublish: false });
  assert.equal(res.status, 400);
  assert.ok((await res.json()).issues.some((i) => i.field === 'consentToPublish'));
  assert.equal(await db.collection('outreachPrograms').countDocuments(), before);
});

test('the honeypot pretends to succeed and saves nothing', async () => {
  const before = await db.collection('outreachPrograms').countDocuments();
  const res = await post({ ...valid(), homepage: 'http://spam.example' });
  assert.equal(res.status, 201);
  assert.equal(await db.collection('outreachPrograms').countDocuments(), before);
});

test('a regular form post redirects back to the page', async () => {
  const body = new URLSearchParams({ ...valid(), gradeBands: 'high', formats: 'weekend', consentToPublish: 'on', scholarships: 'on' });
  body.append('formats', 'mentorship');
  const res = await post(Object.fromEntries([]), { type: 'form' }); // empty form: invalid
  assert.equal(res.status, 303);
  assert.match(res.headers.get('location'), /outreach\.html#submit-error$/);
  const ok = await postOutreach(
    new Request('http://localhost/api/submissions/outreach', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-real-ip': '10.9.9.9' },
      body: body.toString(),
    })
  );
  assert.equal(ok.status, 303);
  assert.match(ok.headers.get('location'), /#submitted$/);
  const saved = await db.collection('outreachPrograms').findOne({ formats: 'mentorship' });
  assert.deepEqual(saved.formats, ['weekend', 'mentorship']);
  assert.equal(saved.scholarships, true);
});

test('the rate limit stops a visitor after 10 attempts an hour', async () => {
  const ip = '10.1.1.1';
  for (let i = 0; i < 10; i++) assert.notEqual((await post({}, { ip })).status, 429);
  const limited = await post(valid(), { ip });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  // The raw IP is never stored.
  assert.equal(await db.collection('rateLimits').countDocuments({ key: ip }), 0);
  assert.equal((await post(valid(), { ip: '10.1.1.2' })).status, 201);
});

test('oversized and non-form bodies are refused', async () => {
  const big = await post({ ...valid(), audience: 'x'.repeat(25_000) });
  assert.equal(big.status, 413);
  const text = await postOutreach(new Request('http://localhost/api/submissions/outreach', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'hi' }));
  assert.equal(text.status, 415);
});

test('the database refuses an approved listing without consent', async () => {
  const doc = { ...valid(), website: 'https://example.org', status: 'approved', createdAt: new Date(), approvedAt: new Date(), consentToPublish: false };
  await assert.rejects(db.collection('outreachPrograms').insertOne(doc));
});

test('after approval GET returns public fields only, filters, and a suppressed funding summary', async () => {
  const pending = await review(db, ['list'], quiet);
  assert.ok(pending.length >= 2);
  for (const doc of pending) await review(db, ['approve', String(doc._id)], quiet);

  const all = await get();
  assert.equal(all.status, 200);
  assert.equal(all.body.count, pending.length);
  const text = JSON.stringify(all.body);
  assert.ok(!text.includes('pat@example.org'), 'no contact email');
  assert.ok(!text.includes('Pat Lee'), 'no contact name');
  assert.ok(!text.includes('federal grant'), 'no funding details');
  for (const listing of all.body.data) {
    assert.ok(!('contactEmail' in listing) && !('fundingChange' in listing) && !('_id' in listing));
  }
  // Fewer than 10 listings, so every funding count is hidden.
  assert.ok(all.body.funding.rows.every((r) => r.count === null && r.suppressed));
  assert.equal(all.body.funding.selfReported, true);
  assert.equal(all.body.funding.verified, false);

  assert.equal((await get('/api/outreach?state=mi')).body.count, 0);
  assert.equal((await get('/api/outreach?state=oh&format=mentorship')).body.count, 1);
  assert.equal((await get('/api/outreach?grade=nursery')).status, 400);
});

test('rejected and pending listings stay hidden', async () => {
  await post({ ...valid(), programName: 'Still Pending' });
  const id = (await db.collection('outreachPrograms').findOne({ programName: 'Still Pending' }))._id;
  assert.ok(!JSON.stringify((await get()).body).includes('Still Pending'));
  await review(db, ['reject', String(id)], quiet);
  assert.ok(!JSON.stringify((await get()).body).includes('Still Pending'));
});
