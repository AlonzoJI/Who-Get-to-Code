// One MongoClient per function instance, reused across invocations.
// Vercel keeps a warm instance's module scope alive between requests, so the
// client (and its connection pool) is created once and shared. attachDatabasePool
// lets Vercel release idle connections before an instance is suspended.
//
// The connection string comes only from the MONGODB_URI environment variable.
import { MongoClient } from 'mongodb';
import { attachDatabasePool } from '@vercel/functions';

export const DB_NAME = process.env.MONGODB_DB || 'who-gets-to-code';

let clientPromise = globalThis.__wgcMongoClientPromise;

export function getClient() {
  if (clientPromise) return clientPromise;
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Add it to .env locally or to the Vercel project settings.');
  }
  const client = new MongoClient(uri, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
    appName: 'who-gets-to-code',
  });
  try {
    attachDatabasePool(client);
  } catch {
    // Outside Vercel (local scripts, tests) there is no pool manager to attach to.
  }
  clientPromise = client.connect();
  // Survives Vite/Node hot reloads in local development.
  globalThis.__wgcMongoClientPromise = clientPromise;
  return clientPromise;
}

export async function getDb() {
  const client = await getClient();
  return client.db(DB_NAME);
}

// For scripts and tests that need to exit cleanly.
export async function closeClient() {
  if (!clientPromise) return;
  const client = await clientPromise;
  await client.close();
  clientPromise = undefined;
  globalThis.__wgcMongoClientPromise = undefined;
}
