import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { Admin } from '../src/modules/admin/admin.model.js';
import { RefreshSession } from '../src/modules/auth/refreshSession.model.js';
import { createTestAdmin, loginAs, TEST_PASSWORD } from './helpers.js';

const LOGIN = '/api/v1/admin/auth/login';
const REFRESH = '/api/v1/admin/auth/refresh';
const LOGOUT = '/api/v1/admin/auth/logout';
const ME = '/api/v1/admin/auth/me';

describe('admin auth', () => {
  let app: Express;

  beforeEach(async () => {
    app = createApp(); // fresh rate-limit store per test
    await createTestAdmin();
  });

  describe('POST /login', () => {
    it('returns tokens and the admin without the password hash', async () => {
      const res = await request(app)
        .post(LOGIN)
        .send({ email: '  Admin@Example.com ', password: TEST_PASSWORD })
        .expect(200);

      expect(res.body.success).toBe(true);
      const data = res.body.data;
      expect(data.accessToken).toEqual(expect.any(String));
      expect(data.refreshToken).toEqual(expect.any(String));
      expect(data.accessTokenExpiresIn).toBe(900);
      expect(data.admin).toMatchObject({ email: 'admin@example.com', name: 'Test Admin' });
      expect(JSON.stringify(data)).not.toContain('passwordHash');
      expect(data.admin.lastLoginAt).not.toBeNull();
    });

    it('stores only a hash of the refresh token', async () => {
      const { refreshToken } = await loginAs(app);
      const sessions = await RefreshSession.find().lean();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]!.tokenHash).not.toBe(refreshToken);
    });

    it('gives the same error for a wrong password and an unknown email', async () => {
      const wrongPassword = await request(app)
        .post(LOGIN)
        .send({ email: 'admin@example.com', password: 'wrong-password' })
        .expect(401);
      const unknownEmail = await request(app)
        .post(LOGIN)
        .send({ email: 'nobody@example.com', password: TEST_PASSWORD })
        .expect(401);

      expect(wrongPassword.body).toEqual(unknownEmail.body);
      expect(wrongPassword.body.error).toEqual({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    });

    it('rejects a deactivated admin with the same error', async () => {
      await Admin.updateOne({ email: 'admin@example.com' }, { isActive: false });
      const res = await request(app)
        .post(LOGIN)
        .send({ email: 'admin@example.com', password: TEST_PASSWORD })
        .expect(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('rejects unknown fields and operator injection', async () => {
      const res = await request(app)
        .post(LOGIN)
        .send({ email: { $ne: null }, password: TEST_PASSWORD, role: 'x' })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.map((d: { field: string }) => d.field)).toEqual(
        expect.arrayContaining(['body.email']),
      );
    });

    it('blocks after 5 failed attempts but does not count successes', async () => {
      await loginAs(app); // success, not counted
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post(LOGIN)
          .send({ email: 'admin@example.com', password: 'wrong' })
          .expect(401);
      }
      const res = await request(app)
        .post(LOGIN)
        .send({ email: 'admin@example.com', password: TEST_PASSWORD })
        .expect(429);
      expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
    });
  });

  describe('GET /me', () => {
    it('returns the current admin for a valid token', async () => {
      const { accessToken } = await loginAs(app);
      const res = await request(app)
        .get(ME)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.data).toMatchObject({ email: 'admin@example.com', isActive: true });
    });

    it('rejects a missing token', async () => {
      const res = await request(app).get(ME).expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects a token signed with another secret', async () => {
      const { admin } = await loginAs(app);
      const forged = jwt.sign({ typ: 'access' }, 'another-secret-another-secret-another', {
        subject: admin.id,
        issuer: 'green-marketplace-api',
        audience: 'green-marketplace-admin',
      });
      await request(app).get(ME).set('Authorization', `Bearer ${forged}`).expect(401);
    });

    it('rejects a valid token once the admin is deactivated', async () => {
      const { accessToken } = await loginAs(app);
      await Admin.updateOne({ email: 'admin@example.com' }, { isActive: false });
      await request(app).get(ME).set('Authorization', `Bearer ${accessToken}`).expect(401);
    });
  });

  describe('POST /refresh', () => {
    it('issues a new pair and makes the old refresh token unusable', async () => {
      const { refreshToken } = await loginAs(app);

      const res = await request(app).post(REFRESH).send({ refreshToken }).expect(200);
      expect(res.body.data.refreshToken).not.toBe(refreshToken);
      await request(app)
        .get(ME)
        .set('Authorization', `Bearer ${res.body.data.accessToken}`)
        .expect(200);

      await request(app).post(REFRESH).send({ refreshToken }).expect(401);
    });

    it('rejects an unknown refresh token', async () => {
      await request(app)
        .post(REFRESH)
        .send({ refreshToken: 'x'.repeat(64) })
        .expect(401);
    });

    it('rejects refresh for a deactivated admin', async () => {
      const { refreshToken } = await loginAs(app);
      await Admin.updateOne({ email: 'admin@example.com' }, { isActive: false });
      await request(app).post(REFRESH).send({ refreshToken }).expect(401);
    });
  });

  describe('POST /logout', () => {
    it('revokes the refresh token and is idempotent', async () => {
      const { refreshToken } = await loginAs(app);
      await request(app).post(LOGOUT).send({ refreshToken }).expect(200);
      await request(app).post(LOGOUT).send({ refreshToken }).expect(200);
      await request(app).post(REFRESH).send({ refreshToken }).expect(401);
    });
  });
});
