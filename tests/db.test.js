// Integration tests against a real, throwaway MongoDB (mongodb-memory-server).
// The first run downloads a MongoDB binary into ~/.cache.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server-core';

let server;
let db;
let seed;
let getDatapoints;
let getSources;

before(async () => {
  server = await MongoMemoryServer.create();
  process.env.MONGODB_URI = server.getUri();
  process.env.MONGODB_DB = 'wgc-test';
  const mongo = await import('../lib/mongodb.js');
  db = await mongo.getDb();
  ({ seed } = await import('../scripts/seed.js'));
  ({ GET: getDatapoints } = await import('../api/datapoints.js'));
  ({ GET: getSources } = await import('../api/sources.js'));
});

after(async () => {
  const mongo = await import('../lib/mongodb.js');
  await mongo.closeClient();
  await server?.stop();
});

const quiet = { log: () => {} };

test('seeding twice creates no duplicates', async () => {
  const first = await seed(db, quiet);
  const second = await seed(db, quiet);
  assert.equal(first.datapoints.inserted, first.datapoints.inFiles);
  assert.equal(second.datapoints.inserted, 0);
  assert.equal(second.sources.inserted, 0);
  assert.equal(await db.collection('datapoints').countDocuments(), first.datapoints.inFiles);
  assert.equal(await db.collection('sources').countDocuments(), first.sources.inFiles);
});

test('validators require core fields but allow extra ones', async () => {
  const dp = db.collection('datapoints');
  // Missing source and pipelineStage.
  await assert.rejects(dp.insertOne({ metric: 'x', value: 1, unit: 'percent', year: 2025, verified: false }));
  // Verified figures must have a year and a source URL.
  await assert.rejects(
    dp.insertOne({ metric: 'x', value: 1, unit: 'percent', year: null, verified: true, pipelineStage: 1, source: { title: 't', publisher: 'p', url: 'https://example.org' } })
  );
  // A valid unverified placeholder with an extra, dataset-specific field is accepted.
  const ok = await dp.insertOne({
    metric: 'test', value: null, unit: null, year: null, verified: false, pipelineStage: null,
    source: { title: null, publisher: null, url: null }, someDatasetField: 'allowed',
  });
  await dp.deleteOne({ _id: ok.insertedId });

  const subs = db.collection('educatorSubmissions');
  await assert.rejects(subs.insertOne({ status: 'published', createdAt: new Date(), consentToPublish: true, state: 'OH' }));
  const s = await subs.insertOne({ status: 'pending', createdAt: new Date(), consentToPublish: true, state: 'OH', extra: 1 });
  await subs.deleteOne({ _id: s.insertedId });
});

test('indexes exist for the page queries', async () => {
  const names = async (c) => (await db.collection(c).indexes()).map((i) => i.name);
  assert.ok((await names('datapoints')).includes('stage_year'));
  assert.ok((await names('datapoints')).includes('state'));
  assert.ok((await names('educatorSubmissions')).includes('status_createdAt'));
  assert.ok((await names('outreachPrograms')).includes('state'));
});

const call = async (handler, path) => {
  const res = await handler(new Request(`http://localhost${path}`));
  return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') };
};

test('GET /api/datapoints filters by stage, group, state and year', async () => {
  const all = await call(getDatapoints, '/api/datapoints');
  assert.equal(all.status, 200);
  assert.equal(all.body.count, await db.collection('datapoints').countDocuments());
  assert.ok(!('_id' in all.body.data[0]));

  const stage4 = await call(getDatapoints, '/api/datapoints?stage=4');
  assert.ok(stage4.body.count > 0 && stage4.body.data.every((d) => d.pipelineStage === 4));

  const ohio = await call(getDatapoints, '/api/datapoints?state=oh');
  assert.ok(ohio.body.count > 0 && ohio.body.data.every((d) => d.geography.state === 'OH'));

  const black = await call(getDatapoints, '/api/datapoints?stage=1&group=black');
  assert.ok(black.body.count > 0 && black.body.data.every((d) => d.group.race === 'black' || /black/i.test(d.group.label)));

  const y2025 = await call(getDatapoints, '/api/datapoints?year=2025');
  assert.ok(y2025.body.data.every((d) => d.year === 2025));

  const bad = await call(getDatapoints, '/api/datapoints?stage=9');
  assert.equal(bad.status, 400);
});

test('GET /api/sources returns the bibliography with pages', async () => {
  const res = await call(getSources, '/api/sources');
  assert.equal(res.status, 200);
  assert.equal(res.body.count, await db.collection('sources').countDocuments());
  assert.ok(res.body.data.every((s) => Array.isArray(s.pages) && ['primary', 'secondary'].includes(s.type)));
  const secondary = await call(getSources, '/api/sources?type=secondary');
  assert.ok(secondary.body.count > 0 && secondary.body.data.every((s) => s.type === 'secondary'));
  const onRollback = await call(getSources, '/api/sources?page=rollback.html');
  assert.ok(onRollback.body.count > 0);
});
