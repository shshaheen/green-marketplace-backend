import request from 'supertest';
import type { Express } from 'express';
import { createAdmin } from '../src/modules/admin/admin.service.js';
import { Customer } from '../src/modules/customer/customer.model.js';
import { hashPassword } from '../src/modules/auth/password.js';
import {
  FakeEmailService,
  getEmailService,
  setEmailService,
} from '../src/modules/email/email.service.js';
import type { ImageStorage } from '../src/modules/upload/imageStorage.js';

/** Smallest valid-looking PNG: the 8-byte signature plus padding. */
export const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32),
]);

/** In-memory stand-in for Cloudinary that records calls and can be told to fail. */
export function createFakeImageStorage() {
  let counter = 0;
  const state = {
    uploaded: [] as string[],
    destroyed: [] as string[],
    /** When set, the upload with this 1-based call number rejects. */
    failOnUploadNumber: null as number | null,
  };
  const storage: ImageStorage = {
    async upload(_file, { folder }) {
      counter += 1;
      if (state.failOnUploadNumber === counter) throw new Error('storage down');
      const publicId = `${folder}/img-${counter}`;
      state.uploaded.push(publicId);
      return { url: `https://images.test/${publicId}.png`, publicId, width: 800, height: 600 };
    },
    async destroy(publicId) {
      state.destroyed.push(publicId);
    },
  };
  return Object.assign(state, { storage });
}

export const TEST_PASSWORD = 'correct-horse-battery';
export const TEST_MPIN = '123456';

export function getTestEmailService(): FakeEmailService {
  const current = getEmailService();
  if (current instanceof FakeEmailService) {
    return current;
  }
  const fake = new FakeEmailService();
  setEmailService(fake);
  return fake;
}

export async function createTestAdmin(
  overrides: { email?: string; name?: string; mpin?: string } = {},
) {
  const admin = await createAdmin({
    name: overrides.name ?? 'Test Admin',
    email: overrides.email ?? 'admin@example.com',
    password: TEST_PASSWORD,
  });

  if (overrides.mpin) {
    const { Admin } = await import('../src/modules/admin/admin.model.js');
    await Admin.findByIdAndUpdate(admin.id, {
      mpinHash: await hashPassword(overrides.mpin),
      isInitialPinSet: true,
    });
  }

  return admin;
}

export async function createTestCustomer(
  overrides: { email?: string; mpin?: string; isActive?: boolean } = {},
) {
  return Customer.create({
    email: overrides.email ?? 'customer@example.com',
    mpinHash: await hashPassword(overrides.mpin ?? TEST_MPIN),
    role: 'customer',
    isEmailVerified: true,
    isActive: overrides.isActive ?? true,
  });
}

export async function loginAs(app: Express, email = 'admin@example.com') {
  const res = await request(app)
    .post('/api/v1/admin/auth/login')
    .send({ email, password: TEST_PASSWORD })
    .expect(200);
  return res.body.data as {
    accessToken: string;
    refreshToken: string;
    admin: { id: string; email: string };
  };
}

export async function loginCustomerAs(
  app: Express,
  email = 'customer@example.com',
  mpin = TEST_MPIN,
) {
  const res = await request(app)
    .post('/api/v1/auth/customer/login')
    .send({ email, mpin })
    .expect(200);
  return res.body.data as {
    accessToken: string;
    refreshToken: string;
    customer: { id: string; email: string };
  };
}
