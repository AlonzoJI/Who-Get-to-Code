// POST and GET /api/submissions/educator against a throwaway MongoDB.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { validAnswers } from './educator-fixtures.js';

let server, db, POST, GET, review;

before(async () => {
  server = await MongoMemoryServer.create();
  process.env.MONGODB_URI = server.getUri();
  process.env.MONGODB_DB = 'wgc-educator-test';
  const mongo = await import('../lib/mongodb.js');
  db = await mongo.getDb();
  await (await import('../lib/schema.js')).ensureSchema(db);
  ({ POST, GET } = await import('../api/submissions/educator.js'));
  ({ review } = await import('../scripts/review-educator.js'));
});

after(async () => {
  await (await import('../lib/mongodb.js')).closeClient();
  await server?.stop();
});

let ipCounter = 0;
const post = async (body, { ip = `10.0.0.${++ipCounter}`, type = 'application/json' } = {}) => {
  const res = await POST(
    new Request('http://localhost/api/submissions/educator', {
      method: 'POST',
      headers: { 'content-type': type, 'x-real-ip': ip },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );
  return { status: res.status, body: await res.json() };
};
const subs = () => db.collection('educatorSubmissions');

test('a valid submission is saved as pending with HTML stripped', async () => {
  const res = await post({ ...validAnswers(), whatWorked: '<script>x()</script><b>Open labs</b>', status: 'approved', email: 'me@school.org' });
  assert.equal(res.status, 201);
  assert.equal(res.body.status, 'pending');
  const doc = await subs().findOne({ whatWorked: 'Open labs' });
  assert.equal(doc.status, 'pending');
  assert.equal(doc.contactEmail, 'me@school.org');
});

test('invalid answers get a 400 with the fields to fix, and nothing is saved', async () => {
  const before = await subs().countDocuments();
  const res = await post({ ...validAnswers(), consentToPublish: false, role: 'x' });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body.issues.map((i) => i.path).sort(), ['consentToPublish', 'role']);
  assert.equal(await subs().countDocuments(), before);
  assert.equal((await post('not json')).status, 400);
  assert.equal((await post('a=b', { type: 'text/plain' })).status, 415);
  assert.equal((await post({ ...validAnswers(), whatWorked: 'x'.repeat(30_000) })).status, 413);
});

test('a filled honeypot looks like success but saves nothing', async () => {
  const before = await subs().countDocuments();
  const res = await post({ ...validAnswers(), homepage: 'http://spam.example' });
  assert.equal(res.status, 201);
  assert.equal(await subs().countDocuments(), before);
});

test('one connection is limited to 10 attempts an hour', async () => {
  const ip = '192.168.50.5';
  for (let i = 0; i < 10; i++) assert.equal((await post(validAnswers(), { ip })).status, 201);
  const blocked = await post(validAnswers(), { ip });
  assert.equal(blocked.status, 429);
  assert.equal((await post(validAnswers(), { ip: '192.168.50.6' })).status, 201);
  // The IP itself is never stored.
  assert.equal(await db.collection('rateLimits').countDocuments({ key: /192\.168/ }), 0);
});

test('GET shows only approved answers, never emails, and hides small counts', async () => {
  const empty = await (await GET(new Request('http://localhost/api/submissions/educator'))).json();
  assert.equal(empty.enough, false);
  assert.equal(empty.total, null);

  const pending = await subs().find({ status: 'pending' }).limit(12).toArray();
  for (const d of pending) await review(db, ['approve', String(d._id)], () => {});
  const featured = pending[0];
  await review(db, ['approve', String(featured._id), '--quote', 'Inviting every student'], () => {});
  await assert.rejects(review(db, ['approve', String(pending[1]._id), '--quote', 'words they never wrote'], () => {}));

  const res = await GET(new Request('http://localhost/api/submissions/educator'));
  const body = await res.json();
  const text = JSON.stringify(body);
  assert.equal(res.status, 200);
  assert.equal(body.total, 12);
  assert.ok(!text.includes('@'), 'no email in the public response');
  assert.ok(!text.includes('_id'));
  assert.equal(body.charts.find((c) => c.id === 'courses').rows.find((r) => r.id === 'ap-csa').count, 12);
  assert.equal(body.charts.find((c) => c.id === 'courses').rows.find((r) => r.id === 'none').count, null);
  assert.equal(body.quotes.length, 1);
  assert.equal(body.quotes[0].text, 'Inviting every student');
  assert.equal(body.quotes[0].state, 'Ohio');
});

test('the database refuses an approved submission without consent', async () => {
  await post(validAnswers());
  const doc = await subs().findOne({ status: 'pending' });
  await assert.rejects(subs().updateOne({ _id: doc._id }, { $set: { status: 'approved', consentToPublish: false } }));
});
