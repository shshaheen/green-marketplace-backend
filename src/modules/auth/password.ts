import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

let dummyHash: string | undefined;

/**
 * Runs a bcrypt comparison that always fails. Used when no account matches,
 * so a login attempt takes about the same time whether or not the email exists.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= await bcrypt.hash('dummy-password-for-timing', env.BCRYPT_SALT_ROUNDS);
  await bcrypt.compare(password, dummyHash);
  return false;
}
