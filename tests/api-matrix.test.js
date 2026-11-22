// Every API route with good input, missing fields, HTML in text boxes and
// repeated fast submissions. Runs against a throwaway MongoDB.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { validAnswers } from './educator-fixtures.js';

const ORIGIN = 'https://site.example';
const PASSWORD = 'matrix-test-password-123';
let server, db, r;

before(async () => {
  server = await MongoMemoryServer.create();
  process.env.MONGODB_URI = server.getUri();
  process.env.MONGODB_DB = 'wgc-matrix';
  process.env.ADMIN_PASSWORD = PASSWORD;
  db = await (await import('../lib/mongodb.js')).getDb();
  await (await import('../scripts/seed.js')).seed(db, { log: () => {} });
  r = {
    datapoints: await import('../api/datapoints.js'),
    sources: await import('../api/sources.js'),
    outreach: await import('../api/outreach.js'),
    eduSub: await import('../api/submissions/educator.js'),
    outSub: await import('../api/submissions/outreach.js'),
    login: await import('../api/admin/login.js'),
    session: await import('../api/admin/session.js'),
    pending: await import('../api/admin/pending.js'),
    moderate: await import('../api/admin/moderate.js'),
    exportRoute: await import('../api/admin/export.js'),
  };
});

after(async () => {
  await (await import('../lib/mongodb.js')).closeClient();
  await server?.stop();
});

let n = 0;
const request = (path, { method = 'GET', body, ip, cookie, raw, type = 'application/json' } = {}) =>
  new Request(`${ORIGIN}${path}`, {
    method,
    headers: { origin: ORIGIN, 'x-real-ip': ip ?? `10.9.${Math.floor(++n / 250)}.${n % 250}`, ...(body || raw ? { 'content-type': type } : {}), ...(cookie ? { cookie } : {}) },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
const read = async (res) => ({ status: res.status, body: res.headers.get('content-type')?.includes('json') ? await res.json() : null });

const program = () => ({
  programName: 'Code Club', organization: 'Library', website: 'example.org', gradeBands: ['high'], audience: 'Teens',
  state: 'OH', city: 'Columbus', formats: ['online'], cost: 'free', scholarships: false, howToConnect: 'Email us',
  fundingChange: 'no', fundingDetails: '', contactName: 'Pat', contactEmail: 'pat@example.org', consentToPublish: true,
});
const HTML = '<script>alert(1)</script><b onclick="x()">Bold</b> <img src=x onerror=alert(2)>text<!-- c -->';
const noTags = (s) => s == null || !/[<>]/.test(s);

// ── read-only routes ─────────────────────────────────────
test('GET routes: good, bad and HTML in query strings', async () => {
  assert.equal((await read(await r.datapoints.GET(request('/api/datapoints?stage=4')))).status, 200);
  assert.equal((await read(await r.datapoints.GET(request('/api/datapoints?stage=abc')))).status, 400);
  const html = await read(await r.datapoints.GET(request(`/api/datapoints?group=${encodeURIComponent('<script>x</script>')}`)));
  assert.equal(html.status, 200);
  assert.equal(html.body.count, 0);
  assert.equal((await read(await r.sources.GET(request('/api/sources?type=primary')))).status, 200);
  assert.equal((await read(await r.sources.GET(request('/api/sources?page=<b>.html')))).status, 400);
  assert.equal((await read(await r.outreach.GET(request('/api/outreach?state=OH')))).status, 200);
  assert.equal((await read(await r.outreach.GET(request('/api/outreach?grade=<b>')))).status, 400);
  const summary = await read(await r.eduSub.GET(request('/api/submissions/educator')));
  assert.equal(summary.status, 200);
});

// ── educator form ────────────────────────────────────────
test('educator POST: good input is saved pending', async () => {
  const res = await read(await r.eduSub.POST(request('/api/submissions/educator', { method: 'POST', body: validAnswers() })));
  assert.equal(res.status, 201);
  assert.equal(res.body.status, 'pending');
});

test('educator POST: missing fields are listed', async () => {
  const empty = await read(await r.eduSub.POST(request('/api/submissions/educator', { method: 'POST', body: {} })));
  assert.equal(empty.status, 400);
  const fields = new Set(empty.body.issues.map((i) => i.field));
  for (const f of ['role', 'state', 'schoolSector', 'gradeBands', 'courses', 'shares', 'changedSince2025', 'consentToPublish']) assert.ok(fields.has(f), f);
  const { consentToPublish, ...noConsent } = validAnswers();
  assert.equal((await r.eduSub.POST(request('/api/submissions/educator', { method: 'POST', body: noConsent }))).status, 400);
  assert.equal((await r.eduSub.POST(request('/api/submissions/educator', { method: 'POST', raw: '{"role":' }))).status, 400);
  assert.equal((await r.eduSub.POST(request('/api/submissions/educator', { method: 'POST', raw: 'x', type: 'text/plain' }))).status, 415);
});

test('educator POST: HTML in text boxes is stripped before saving', async () => {
  const body = { ...validAnswers(), whatWorked: HTML, changeDetails: `Line one<br>${HTML}`, name: '<i>Ms. R</i>', school: '<a href="x">Lincoln</a>', courses: ['other'], coursesOther: '<u>Robotics</u>' };
  assert.equal((await r.eduSub.POST(request('/api/submissions/educator', { method: 'POST', body }))).status, 201);
  const doc = await db.collection('educatorSubmissions').findOne({}, { sort: { createdAt: -1 } });
  for (const v of [doc.whatWorked, doc.changeDetails, doc.contact.name, doc.contact.school, doc.coursesOther]) assert.ok(noTags(v), v);
  assert.equal(doc.whatWorked, 'Bold text');
  assert.ok(!/alert/.test(doc.whatWorked));
});

// ── outreach form ────────────────────────────────────────
test('outreach POST: good JSON and good form post are saved pending', async () => {
  assert.equal((await r.outSub.POST(request('/api/submissions/outreach', { method: 'POST', body: program() }))).status, 201);
  const form = new URLSearchParams({ ...program(), gradeBands: 'high', formats: 'online', scholarships: '', consentToPublish: 'on' });
  const res = await r.outSub.POST(request('/api/submissions/outreach', { method: 'POST', raw: form.toString(), type: 'application/x-www-form-urlencoded' }));
  assert.equal(res.status, 303);
  assert.match(res.headers.get('location'), /#submitted$/);
  assert.ok((await db.collection('outreachPrograms').find().toArray()).every((d) => d.status === 'pending'));
});

test('outreach POST: missing fields are listed, javascript: links refused', async () => {
  const empty = await read(await r.outSub.POST(request('/api/submissions/outreach', { method: 'POST', body: {} })));
  assert.equal(empty.status, 400);
  const fields = new Set(empty.body.issues.map((i) => i.field));
  for (const f of ['programName', 'organization', 'website', 'gradeBands', 'state', 'formats', 'cost', 'howToConnect', 'contactEmail', 'consentToPublish']) assert.ok(fields.has(f), f);
  const js = await read(await r.outSub.POST(request('/api/submissions/outreach', { method: 'POST', body: { ...program(), website: 'javascript:alert(1)' } })));
  assert.equal(js.status, 400);
  assert.ok(js.body.issues.some((i) => i.field === 'website'));
});

test('outreach POST: HTML in text boxes is stripped before saving', async () => {
  const body = { ...program(), programName: `<b>Robo</b>tics ${HTML}`, audience: HTML, howToConnect: `<a href="javascript:x">Email</a> us`, city: '<i>Akron</i>', fundingDetails: HTML, contactName: '<s>Pat</s>' };
  assert.equal((await r.outSub.POST(request('/api/submissions/outreach', { method: 'POST', body }))).status, 201);
  const doc = await db.collection('outreachPrograms').findOne({}, { sort: { createdAt: -1 } });
  for (const f of ['programName', 'audience', 'howToConnect', 'city', 'fundingDetails', 'contactName']) assert.ok(noTags(doc[f]), `${f}: ${doc[f]}`);
  assert.equal(doc.howToConnect, 'Email us');
});

// ── repeated fast submissions ────────────────────────────
for (const [name, path, mod, body] of [
  ['educator', '/api/submissions/educator', 'eduSub', () => validAnswers()],
  ['outreach', '/api/submissions/outreach', 'outSub', () => program()],
]) {
  test(`${name} POST: a burst of 25 at once from one connection lets at most 10 through`, async () => {
    const ip = `198.51.100.${name === 'educator' ? 1 : 2}`;
    const before = await db.collection(name === 'educator' ? 'educatorSubmissions' : 'outreachPrograms').countDocuments();
    const results = await Promise.all(
      Array.from({ length: 25 }, () => r[mod].POST(request(path, { method: 'POST', body: body(), ip })).then((x) => x.status))
    );
    const accepted = results.filter((s) => s === 201).length;
    const limited = results.filter((s) => s === 429).length;
    assert.ok(accepted <= 10, `accepted ${accepted}`);
    assert.equal(accepted + limited, 25);
    const after = await db.collection(name === 'educator' ? 'educatorSubmissions' : 'outreachPrograms').countDocuments();
    assert.equal(after - before, accepted);
    // Sequential attempts after the burst are still refused.
    assert.equal((await r[mod].POST(request(path, { method: 'POST', body: body(), ip }))).status, 429);
  });
}

test('admin login: a burst of 10 wrong passwords at once lets at most 5 be checked', async () => {
  const results = await Promise.all(
    Array.from({ length: 10 }, () => r.login.POST(request('/api/admin/login', { method: 'POST', body: { password: 'nope' }, ip: '198.51.100.9' })).then((x) => x.status))
  );
  assert.ok(results.filter((s) => s === 401).length <= 5, results.join(','));
  assert.ok(results.filter((s) => s === 429).length >= 5);
});

// ── admin routes ─────────────────────────────────────────
test('admin routes: good input, missing fields and HTML in edits', async () => {
  const signIn = await r.login.POST(request('/api/admin/login', { method: 'POST', body: { password: PASSWORD } }));
  assert.equal(signIn.status, 200);
  const cookie = signIn.headers.get('set-cookie').split(';')[0];
  assert.equal((await r.login.POST(request('/api/admin/login', { method: 'POST', body: {} }))).status, 401);

  assert.equal((await r.session.GET(request('/api/admin/session', { cookie }))).status, 200);
  const list = await read(await r.pending.GET(request('/api/admin/pending', { cookie })));
  assert.equal(list.status, 200);
  const id = list.body.educator[0]._id;

  const call = (body) => r.moderate.POST(request('/api/admin/moderate', { method: 'POST', cookie, body }));
  assert.equal((await call({})).status, 400, 'missing everything');
  assert.equal((await call({ collection: 'educator', id })).status, 400, 'missing action');
  assert.equal((await call({ collection: 'educator', action: 'approve' })).status, 400, 'missing id');

  const edited = await read(await call({ collection: 'educator', id, action: 'edit', edits: { whatWorked: HTML, 'contact.name': '<b>Name</b>' } }));
  assert.equal(edited.status, 200);
  assert.ok(noTags(edited.body.item.whatWorked) && noTags(edited.body.item.contact.name));

  assert.equal((await call({ collection: 'educator', id, action: 'approve', quoteField: 'whatWorked' })).status, 200);
  const exported = await read(await r.exportRoute.GET(request('/api/admin/export', { cookie })));
  assert.equal(exported.status, 200);
  assert.ok(exported.body.educatorSubmissions.some((d) => String(d._id) === id));

  const log = await db.collection('moderationLog').find({}).toArray();
  assert.deepEqual(log.map((l) => l.action).sort(), ['approve', 'edit']);
});
