/**
 * Creates an admin account. Safe to run more than once: an existing email is left unchanged.
 *
 * Usage:
 *   npm run seed:admin
 *
 * Reads SEED_ADMIN_NAME, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD from the environment.
 * Anything missing is prompted for; the password prompt does not echo, which keeps the
 * password out of shell history.
 */
import { createInterface } from 'node:readline/promises';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { env } from '../config/env.js';
import { createAdmin, findAdminByEmail } from '../modules/admin/admin.service.js';
import { createAdminSchema } from '../modules/admin/admin.validation.js';

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

function promptHidden(question: string): Promise<string> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) {
    return Promise.reject(new Error('No terminal available. Set SEED_ADMIN_PASSWORD instead.'));
  }

  return new Promise((resolve, reject) => {
    let value = '';
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          cleanup();
          return resolve(value);
        }
        if (char === '\u0003') {
          cleanup();
          return reject(new Error('Cancelled'));
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else value += char;
      }
    };

    stdout.write(question);
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

async function main(): Promise<void> {
  const name = process.env.SEED_ADMIN_NAME?.trim() || (await prompt('Admin name: '));
  const email = process.env.SEED_ADMIN_EMAIL?.trim() || (await prompt('Admin email: '));

  const parsedEmail = createAdminSchema.shape.email.safeParse(email);
  if (!parsedEmail.success) throw new Error('Invalid email address');

  await connectDatabase(env.MONGODB_URI);
  try {
    if (await findAdminByEmail(parsedEmail.data)) {
      console.log(`An admin with email ${parsedEmail.data} already exists. No changes made.`);
      return;
    }

    let password = process.env.SEED_ADMIN_PASSWORD;
    if (!password) {
      password = await promptHidden('Admin password (min 12 characters): ');
      const confirm = await promptHidden('Confirm password: ');
      if (password !== confirm) throw new Error('Passwords do not match');
    }

    const input = createAdminSchema.safeParse({ name, email, password });
    if (!input.success) {
      const problems = input.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      throw new Error(`Invalid admin details:\n  ${problems.join('\n  ')}`);
    }

    const admin = await createAdmin(input.data);
    console.log(`Created admin ${admin.email} (id ${admin.id}).`);
  } finally {
    await disconnectDatabase();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
