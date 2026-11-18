import request from 'supertest';
import type { Express } from 'express';
import { createAdmin } from '../src/modules/admin/admin.service.js';
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

export async function createTestAdmin(overrides: { email?: string; name?: string } = {}) {
  return createAdmin({
    name: overrides.name ?? 'Test Admin',
    email: overrides.email ?? 'admin@example.com',
    password: TEST_PASSWORD,
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
