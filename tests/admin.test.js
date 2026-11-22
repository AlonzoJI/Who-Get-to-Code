// Admin page backend: sign-in, signed session cookie, moderation with logging,
// and export. Runs against a throwaway MongoDB (mongodb-memory-server).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { validAnswers } from './educator-fixtures.js';

const ORIGIN = 'https://site.example';
const PASSWORD = 'correct horse battery staple';
let server, db, auth, login, session, pending, moderate, exportRoute, buildSubmission, educatorGet, outreachGet, review;

before(async () => {
  server = await MongoMemoryServer.create();
  process.env.MONGODB_URI = server.getUri();
  process.env.MONGODB_DB = 'wgc-admin-test';
  process.env.ADMIN_PASSWORD = PASSWORD;
  db = await (await import('../lib/mongodb.js')).getDb();
  await (await import('../lib/schema.js')).ensureSchema(db);
  auth = await import('../lib/admin-auth.js');
  login = await import('../api/admin/login.js');
  session = await import('../api/admin/session.js');
  pending = await import('../api/admin/pending.js');
  moderate = await import('../api/admin/moderate.js');
  exportRoute = await import('../api/admin/export.js');
  ({ buildSubmission } = await import('../lib/educator.js'));
  ({ GET: educatorGet } = await import('../api/submissions/educator.js'));
  ({ GET: outreachGet } = await import('../api/outreach.js'));
  ({ review } = await import('../scripts/review-outreach.js'));
});

after(async () => {
  await (await import('../lib/mongodb.js')).closeClient();
  await server?.stop();
});

let ip = 0;
const req = (path, { method = 'GET', body, cookie, origin = ORIGIN, fixedIp } = {}) =>
  new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(origin ? { origin } : {}),
      ...(cookie ? { cookie } : {}),
      'x-real-ip': fixedIp ?? `10.1.0.${++ip}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

async function signIn() {
  const res = await login.POST(req('/api/admin/login', { method: 'POST', body: { password: PASSWORD } }));
  assert.equal(res.status, 200);
  return res.headers.get('set-cookie').split(';')[0];
}

const outreachDoc = (over = {}) => ({
  status: 'pending', createdAt: new Date(), approvedAt: null, consentToPublish: true, state: 'OH',
  programName: 'Code Clbu', organization: 'Library', website: 'https://example.org', gradeBands: ['high'],
  audience: 'Teens', formats: ['online'], cost: 'free', scholarships: false, howToConnect: 'Email us',
  fundingChange: 'no', contactName: 'Pat', contactEmail: 'pat@example.org', ...over,
});

test('password check and signed session', () => {
  assert.equal(auth.checkPassword('nope'), false);
  assert.equal(auth.checkPassword(PASSWORD), true);
  const token = auth.createSession();
  assert.equal(auth.verifySession(token), true);
  const [v, exp, nonce, sig] = token.split('.');
  assert.equal(auth.verifySession(`${v}.${Number(exp) + 9999}.${nonce}.${sig}`), false, 'changed expiry breaks the signature');
  assert.equal(auth.verifySession(token, Date.now() + (auth.SESSION_SECONDS + 5) * 1000), false, 'expired');
  assert.equal(auth.verifySession('garbage'), false);
});

test('sign-in: cookie is HttpOnly, Strict, Secure and scoped to /api/admin; wrong password refused', async () => {
  const bad = await login.POST(req('/api/admin/login', { method: 'POST', body: { password: 'wrong' } }));
  assert.equal(bad.status, 401);
  assert.equal(bad.headers.get('set-cookie'), null);
  const res = await login.POST(req('/api/admin/login', { method: 'POST', body: { password: PASSWORD } }));
  const cookie = res.headers.get('set-cookie');
  for (const part of ['HttpOnly', 'SameSite=Strict', 'Secure', 'Path=/api/admin']) assert.ok(cookie.includes(part), part);
  assert.ok(!cookie.includes(PASSWORD));
  const cross = await login.POST(req('/api/admin/login', { method: 'POST', body: { password: PASSWORD }, origin: 'https://evil.example' }));
  assert.equal(cross.status, 403);
});

test('sign-in is rate limited to 5 tries per hour per connection', async () => {
  let last;
  for (let i = 0; i < 6; i++) last = await login.POST(req('/api/admin/login', { method: 'POST', body: { password: 'wrong' }, fixedIp: '203.0.113.9' }));
  assert.equal(last.status, 429);
});

test('admin routes refuse without a valid session', async () => {
  assert.equal((await session.GET(req('/api/admin/session'))).status, 401);
  assert.equal((await pending.GET(req('/api/admin/pending', { cookie: 'wgc_admin=v1.9999999999.x.forged' }))).status, 401);
  assert.equal((await exportRoute.GET(req('/api/admin/export'))).status, 401);
  const cookie = await signIn();
  assert.equal((await session.GET(req('/api/admin/session', { cookie }))).status, 200);
  const cross = await moderate.POST(req('/api/admin/moderate', { method: 'POST', cookie, origin: 'https://evil.example', body: { collection: 'outreach', id: 'a'.repeat(24), action: 'reject' } }));
  assert.equal(cross.status, 403);
});

test('pending list is newest first and shows contact info; public APIs never do', async () => {
  const cookie = await signIn();
  const older = buildSubmission({ ...validAnswers(), name: 'Ms. Rivera', school: 'Lincoln High', email: 'rivera@school.org', coursesOther: '', barriersOther: '', showNameAndSchool: false }, new Date('2026-11-01'));
  const newer = buildSubmission({ ...validAnswers(), name: '', school: '', email: 'b@school.org', coursesOther: '', barriersOther: '', showNameAndSchool: false }, new Date('2026-11-20'));
  await db.collection('educatorSubmissions').insertMany([older, newer]);
  await db.collection('outreachPrograms').insertOne(outreachDoc());

  const res = await pending.GET(req('/api/admin/pending', { cookie }));
  const body = await res.json();
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(body.educator.map((d) => d.contactEmail), ['b@school.org', 'rivera@school.org']);
  assert.equal(body.outreach[0].contactEmail, 'pat@example.org');

  const pub = JSON.stringify([await (await educatorGet()).json(), await (await outreachGet(new Request(`${ORIGIN}/api/outreach`))).json()]);
  assert.ok(!/school\.org|example\.org"?,?\s*"contact|contactEmail|rivera@/.test(pub));
});

test('edit, then approve with a quote choice; each step is logged', async () => {
  const cookie = await signIn();
  const doc = await db.collection('educatorSubmissions').findOne({ contactEmail: 'rivera@school.org' });
  const id = String(doc._id);

  const res = await moderate.POST(req('/api/admin/moderate', {
    method: 'POST', cookie,
    body: { collection: 'educator', id, action: 'approve', quoteField: 'whatWorked', edits: { whatWorked: 'Inviting every student in Algebra I to an open lab.  <b>Really</b>' } },
  }));
  assert.equal(res.status, 200);
  const saved = await db.collection('educatorSubmissions').findOne({ _id: doc._id });
  assert.equal(saved.status, 'approved');
  assert.equal(saved.whatWorked, 'Inviting every student in Algebra I to an open lab. Really');
  assert.deepEqual([saved.review.featured, saved.review.quoteField, saved.review.quote], [true, 'whatWorked', saved.whatWorked]);

  const logs = await db.collection('moderationLog').find({ itemId: doc._id }).sort({ at: 1 }).toArray();
  assert.deepEqual(logs.map((l) => l.action), ['edit', 'approve']);
  assert.equal(logs[0].changes[0].field, 'whatWorked');
  assert.ok(logs.every((l) => l.at instanceof Date && l.via === 'admin-page'));
});

test('reject, quote validation, non-editable fields and consent are enforced', async () => {
  const cookie = await signIn();
  const other = await db.collection('educatorSubmissions').findOne({ contactEmail: 'b@school.org' });
  const call = (body) => moderate.POST(req('/api/admin/moderate', { method: 'POST', cookie, body }));

  assert.equal((await call({ collection: 'educator', id: String(other._id), action: 'edit', edits: { state: 'TX' } })).status, 400);
  assert.equal((await call({ collection: 'educator', id: String(other._id), action: 'approve', quoteField: 'shares' })).status, 400);
  await db.collection('educatorSubmissions').updateOne({ _id: other._id }, { $set: { changeDetails: null } });
  assert.equal((await call({ collection: 'educator', id: String(other._id), action: 'approve', quoteField: 'changeDetails' })).status, 400, 'empty answer cannot be the quote');
  assert.equal((await call({ collection: 'educator', id: String(other._id), action: 'reject' })).status, 200);
  assert.equal((await db.collection('educatorSubmissions').findOne({ _id: other._id })).status, 'rejected');

  const noConsent = await db.collection('outreachPrograms').insertOne(outreachDoc({ consentToPublish: false, contactEmail: 'x@example.org' }));
  assert.equal((await call({ collection: 'outreach', id: String(noConsent.insertedId), action: 'approve' })).status, 400);
  assert.equal((await call({ collection: 'outreach', id: 'f'.repeat(24), action: 'approve' })).status, 404);
});

test('outreach typo fix and approve; review script approvals are logged too', async () => {
  const cookie = await signIn();
  const prog = await db.collection('outreachPrograms').findOne({ programName: 'Code Clbu' });
  const res = await moderate.POST(req('/api/admin/moderate', { method: 'POST', cookie, body: { collection: 'outreach', id: String(prog._id), action: 'approve', edits: { programName: 'Code Club' } } }));
  assert.equal(res.status, 200);
  const saved = await db.collection('outreachPrograms').findOne({ _id: prog._id });
  assert.equal(saved.programName, 'Code Club');
  assert.ok(saved.approvedAt instanceof Date);

  const another = await db.collection('outreachPrograms').insertOne(outreachDoc({ programName: 'Robotics', contactEmail: 'r@example.org' }));
  await review(db, ['approve', String(another.insertedId)], { log: () => {} });
  const cli = await db.collection('moderationLog').findOne({ itemId: another.insertedId });
  assert.deepEqual([cli.action, cli.via], ['approve', 'cli']);

  // Approved listings are public, but contact details still never leave the admin routes.
  const pub = await (await outreachGet(new Request(`${ORIGIN}/api/outreach`))).json();
  assert.ok(pub.data.some((l) => l.programName === 'Code Club'));
  assert.ok(!JSON.stringify(pub).includes('example.org"') || !/contact(Name|Email)/.test(JSON.stringify(pub)));
  assert.ok(pub.data.every((l) => !('contactEmail' in l) && !('contactName' in l)));
});

test('export downloads approved submissions only, as an attachment', async () => {
  const cookie = await signIn();
  const res = await exportRoute.GET(req('/api/admin/export', { cookie }));
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /attachment; filename="approved-submissions-\d{4}-\d{2}-\d{2}\.json"/);
  const body = await res.json();
  assert.ok(body.educatorSubmissions.length >= 1 && body.educatorSubmissions.every((d) => d.status === 'approved'));
  assert.ok(body.outreachPrograms.length >= 1 && body.outreachPrograms.every((d) => d.status === 'approved'));
});
