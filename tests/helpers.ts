import request from 'supertest';
import type { Express } from 'express';
import { createAdmin } from '../src/modules/admin/admin.service.js';

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
