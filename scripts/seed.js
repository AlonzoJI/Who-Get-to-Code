// Loads /data into MongoDB. Safe to run any number of times: every document is
// upserted on a stable key (sourceFile + recordId for datapoints, key for
// sources), so a second run updates in place instead of duplicating.
//
// Run with: corepack pnpm seed   (reads MONGODB_URI from .env)
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { getDb, closeClient } from '../lib/mongodb.js';
import { ensureSchema } from '../lib/schema.js';
import { buildDatapoints, buildSources, pagesBySource, readDataDir } from '../lib/seed-data.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

export async function seed(db, { log = console.log } = {}) {
  await ensureSchema(db);

  const files = readDataDir(root);
  const get = (name) => files.find(([f]) => f === name)?.[1];
  const now = new Date();

  const datapoints = buildDatapoints(files);
  const dp = await db.collection('datapoints').bulkWrite(
    datapoints.map((doc) => ({
      updateOne: {
        filter: { sourceFile: doc.sourceFile, recordId: doc.recordId },
        update: { $set: { ...doc, seededAt: now }, $setOnInsert: { createdAt: now } },
        upsert: true,
      },
    })),
    { ordered: false }
  );

  const sources = buildSources(get('bibliography.json'), pagesBySource(root, files), get('readings.json'));
  const src = await db.collection('sources').bulkWrite(
    sources.map((doc) => ({
      updateOne: {
        filter: { key: doc.key },
        update: { $set: { ...doc, seededAt: now }, $setOnInsert: { createdAt: now } },
        upsert: true,
      },
    })),
    { ordered: false }
  );

  const summary = {
    datapoints: { inFiles: datapoints.length, inserted: dp.upsertedCount, updated: dp.modifiedCount },
    sources: { inFiles: sources.length, inserted: src.upsertedCount, updated: src.modifiedCount },
  };
  log(JSON.stringify(summary, null, 2));
  return summary;
}

// Run directly (not when imported by tests).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await seed(await getDb());
  } catch (err) {
    console.error(`Seed failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await closeClient();
  }
}
