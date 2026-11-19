import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { RefreshSession } from '../src/modules/auth/refreshSession.model.js';
import { createTestAdmin, getTestEmailService, TEST_MPIN, TEST_PASSWORD } from './helpers.js';

const ADMIN_LOGIN = '/api/v1/auth/admin/login';
const SEND_INITIAL_OTP = '/api/v1/auth/admin/initial-pin/send-otp';
const VERIFY_INITIAL_OTP = '/api/v1/auth/admin/initial-pin/verify-otp';
const SET_INITIAL_PIN = '/api/v1/auth/admin/initial-pin/set-pin';
const SEND_FORGOT_OTP = '/api/v1/auth/admin/forgot-pin/send-otp';
const VERIFY_FORGOT_OTP = '/api/v1/auth/admin/forgot-pin/verify-otp';
const RESET_PIN = '/api/v1/auth/admin/forgot-pin/reset';

describe('admin MPIN authentication', () => {
  let app: Express;
  const emailService = getTestEmailService();

  beforeEach(async () => {
    app = createApp();
    emailService.clear();
  });

  describe('Initial MPIN Setup Flow', () => {
    it('refuses initial OTP if email is not a pre-created admin', async () => {
      const res = await request(app)
        .post(SEND_INITIAL_OTP)
        .send({ email: 'notanadmin@example.com' })
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(emailService.sentEmails).toHaveLength(0);
    });

    it('sends initial setup OTP and sets initial MPIN', async () => {
      const admin = await createTestAdmin({ email: 'newadmin@example.com' });
      expect(admin.isInitialPinSet).toBe(false);

      // Try login before MPIN is set
      const preLogin = await request(app)
        .post(ADMIN_LOGIN)
        .send({ email: 'newadmin@example.com', mpin: '123456' })
        .expect(400);
      expect(preLogin.body.error.message).toContain('Initial MPIN setup required');

      // Request OTP
      await request(app).post(SEND_INITIAL_OTP).send({ email: 'newadmin@example.com' }).expect(200);

      expect(emailService.sentEmails).toHaveLength(1);
      const otp = emailService.sentEmails[0]!.otp;

      // Verify OTP
      const verifyRes = await request(app)
        .post(VERIFY_INITIAL_OTP)
        .send({ email: 'newadmin@example.com', otp })
        .expect(200);

      const { verificationToken } = verifyRes.body.data;

      // Set initial MPIN
      const setPinRes = await request(app)
        .post(SET_INITIAL_PIN)
        .send({
          email: 'newadmin@example.com',
          verificationToken,
          mpin: '654321',
          confirmMpin: '654321',
        })
        .expect(201);

      expect(setPinRes.body.data.admin).toMatchObject({
        email: 'newadmin@example.com',
        role: 'admin',
        isInitialPinSet: true,
      });

      // Now admin can log in with MPIN
      const loginRes = await request(app)
        .post(ADMIN_LOGIN)
        .send({ email: 'newadmin@example.com', mpin: '654321' })
        .expect(200);
      expect(loginRes.body.data.accessToken).toEqual(expect.any(String));

      // Attempting to request initial OTP again is rejected
      await request(app).post(SEND_INITIAL_OTP).send({ email: 'newadmin@example.com' }).expect(400);
    });
  });

  describe('Admin Login & Lockout', () => {
    it('supports backward compatibility with password login', async () => {
      await createTestAdmin({ email: 'compat@example.com' });

      const res = await request(app)
        .post(ADMIN_LOGIN)
        .send({ email: 'compat@example.com', password: TEST_PASSWORD })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.admin.email).toBe('compat@example.com');
    });

    it('locks admin account after 5 failed MPIN attempts', async () => {
      await createTestAdmin({ email: 'lockadmin@example.com', mpin: TEST_MPIN });

      for (let i = 0; i < 5; i++) {
        await request(app)
          .post(ADMIN_LOGIN)
          .send({ email: 'lockadmin@example.com', mpin: '000000' })
          .expect(401);
      }

      const freshApp = createApp();
      const res = await request(freshApp)
        .post(ADMIN_LOGIN)
        .send({ email: 'lockadmin@example.com', mpin: TEST_MPIN })
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Admin Forgot / Reset MPIN Flow', () => {
    it('allows admin to reset MPIN via OTP and revokes previous sessions', async () => {
      await createTestAdmin({ email: 'resetadmin@example.com', mpin: '111111' });

      // Login to get a session
      const loginRes = await request(app)
        .post(ADMIN_LOGIN)
        .send({ email: 'resetadmin@example.com', mpin: '111111' })
        .expect(200);
      const { refreshToken } = loginRes.body.data;
      expect(await RefreshSession.countDocuments()).toBe(1);

      // Request reset OTP
      await request(app)
        .post(SEND_FORGOT_OTP)
        .send({ email: 'resetadmin@example.com' })
        .expect(200);

      const otp = emailService.sentEmails[0]!.otp;

      // Verify OTP
      const verifyRes = await request(app)
        .post(VERIFY_FORGOT_OTP)
        .send({ email: 'resetadmin@example.com', otp })
        .expect(200);

      const { verificationToken } = verifyRes.body.data;

      // Reset MPIN
      await request(app)
        .post(RESET_PIN)
        .send({
          email: 'resetadmin@example.com',
          verificationToken,
          mpin: '888888',
          confirmMpin: '888888',
        })
        .expect(200);

      // Old session revoked
      expect(await RefreshSession.countDocuments()).toBe(0);

      // Old refresh token fails
      await request(app)
        .post('/api/v1/auth/admin/refresh')
        .send({ refreshToken })
        .expect(401);

      // Old MPIN fails
      await request(app)
        .post(ADMIN_LOGIN)
        .send({ email: 'resetadmin@example.com', mpin: '111111' })
        .expect(401);

      // New MPIN succeeds
      await request(app)
        .post(ADMIN_LOGIN)
        .send({ email: 'resetadmin@example.com', mpin: '888888' })
        .expect(200);
    });
  });

  describe('Route Aliasing & Role Separation', () => {
    it('works identically via /api/v1/admin/auth alias', async () => {
      await createTestAdmin({ email: 'alias@example.com', mpin: '123456' });

      const res = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ email: 'alias@example.com', mpin: '123456' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('rejects admin tokens on customer endpoints', async () => {
      await createTestAdmin({ email: 'admin-not-customer@example.com', mpin: '123456' });
      const loginRes = await request(app)
        .post(ADMIN_LOGIN)
        .send({ email: 'admin-not-customer@example.com', mpin: '123456' })
        .expect(200);

      const { accessToken } = loginRes.body.data;

      // Call customer /me with admin token
      await request(app)
        .get('/api/v1/auth/customer/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });
  });
});
