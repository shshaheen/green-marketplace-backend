import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

// Drop unknown fields from query filters. Operator injection is prevented by
// validating every request with strict Zod schemas that only accept primitive
// values, so client input never reaches a filter as an object.
mongoose.set('strictQuery', true);

export async function connectDatabase(uri: string): Promise<void> {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  logger.info({ db: mongoose.connection.name }, 'Connected to MongoDB');
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}
