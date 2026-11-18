import { afterAll, afterEach, beforeAll } from 'vitest';
import type { MongoMemoryServer } from 'mongodb-memory-server';

// Must be set before any app module is imported (env is validated at import time).
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://placeholder-overridden-by-memory-server';
process.env.JWT_ACCESS_SECRET = 'test-secret-that-is-at-least-32-characters-long';
process.env.BCRYPT_SALT_ROUNDS = '10';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const { connectDatabase } = await import('../src/config/db.js');
  mongo = await MongoMemoryServer.create();
  await connectDatabase(mongo.getUri());
});

afterEach(async () => {
  const { default: mongoose } = await import('mongoose');
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
  );
});

afterAll(async () => {
  const { disconnectDatabase } = await import('../src/config/db.js');
  await disconnectDatabase();
  await mongo?.stop();
});
