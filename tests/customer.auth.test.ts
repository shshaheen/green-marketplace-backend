import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { Customer } from '../src/modules/customer/customer.model.js';
import { OtpVerification } from '../src/modules/auth/otpVerification.model.js';
import { RefreshSession } from '../src/modules/auth/refreshSession.model.js';
import { createTestCustomer, getTestEmailService, loginCustomerAs } from './helpers.js';

const SEND_REG_OTP = '/api/v1/auth/customer/register/send-otp';
const VERIFY_REG_OTP = '/api/v1/auth/customer/register/verify-otp';
const SET_REG_PIN = '/api/v1/auth/customer/register/set-pin';
const LOGIN = '/api/v1/auth/customer/login';
const SEND_FORGOT_OTP = '/api/v1/auth/customer/forgot-pin/send-otp';
const VERIFY_FORGOT_OTP = '/api/v1/auth/customer/forgot-pin/verify-otp';
const RESET_PIN = '/api/v1/auth/customer/forgot-pin/reset';
const REFRESH = '/api/v1/auth/customer/refresh';
const LOGOUT = '/api/v1/auth/customer/logout';
const ME = '/api/v1/auth/customer/me';

describe('customer authentication', () => {
  let app: Express;
  const emailService = getTestEmailService();

  beforeEach(() => {
    app = createApp();
    emailService.clear();
  });

  describe('Registration Flow', () => {
    it('sends a 6-digit OTP email upon registration request', async () => {
      const res = await request(app)
        .post(SEND_REG_OTP)
        .send({ email: 'newcustomer@example.com' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.cooldownSeconds).toBe(60);
      expect(emailService.sentEmails).toHaveLength(1);
      expect(emailService.sentEmails[0]!.to).toBe('newcustomer@example.com');
      expect(emailService.sentEmails[0]!.otp).toMatch(/^\d{6}$/);

      const record = await OtpVerification.findOne({
        email: 'newcustomer@example.com',
        purpose: 'customer_registration',
      });
      expect(record).not.toBeNull();
      expect(record!.attempts).toBe(0);
    });

    it('rejects sending registration OTP if email already exists', async () => {
      await createTestCustomer({ email: 'existing@example.com' });

      const res = await request(app)
        .post(SEND_REG_OTP)
        .send({ email: 'existing@example.com' })
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(emailService.sentEmails).toHaveLength(0);
    });

    it('enforces resend cooldown period', async () => {
      await request(app).post(SEND_REG_OTP).send({ email: 'cooldown@example.com' }).expect(200);

      const res = await request(app)
        .post(SEND_REG_OTP)
        .send({ email: 'cooldown@example.com' })
        .expect(429);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
      expect(emailService.sentEmails).toHaveLength(1);
    });

    it('completes the full registration flow and sets MPIN', async () => {
      const email = 'flow@example.com';
      await request(app).post(SEND_REG_OTP).send({ email }).expect(200);

      const otp = emailService.sentEmails[0]!.otp;

      // Verify OTP
      const verifyRes = await request(app).post(VERIFY_REG_OTP).send({ email, otp }).expect(200);

      expect(verifyRes.body.success).toBe(true);
      const { verificationToken } = verifyRes.body.data;
      expect(verificationToken).toEqual(expect.any(String));

      // Set MPIN
      const setPinRes = await request(app)
        .post(SET_REG_PIN)
        .send({
          email,
          verificationToken,
          mpin: '654321',
          confirmMpin: '654321',
        })
        .expect(201);

      expect(setPinRes.body.success).toBe(true);
      expect(setPinRes.body.data.accessToken).toEqual(expect.any(String));
      expect(setPinRes.body.data.refreshToken).toEqual(expect.any(String));
      expect(setPinRes.body.data.customer).toMatchObject({
        email,
        role: 'customer',
        isActive: true,
      });

      const customerInDb = await Customer.findOne({ email }).select('+mpinHash');
      expect(customerInDb).not.toBeNull();
      expect(customerInDb!.mpinHash).not.toBe('654321');

      // Verification token must be consumed and cannot be reused
      await request(app)
        .post(SET_REG_PIN)
        .send({
          email,
          verificationToken,
          mpin: '654321',
          confirmMpin: '654321',
        })
        .expect(400);
    });

    it('rejects verification if OTP is wrong and locks after 5 attempts', async () => {
      const email = 'attempts@example.com';
      await request(app).post(SEND_REG_OTP).send({ email }).expect(200);

      for (let i = 1; i <= 4; i++) {
        const res = await request(app)
          .post(VERIFY_REG_OTP)
          .send({ email, otp: '000000' })
          .expect(400);
        expect(res.body.error.message).toContain(`${5 - i} attempt(s) remaining`);
      }

      // 5th attempt invalidates OTP
      const finalRes = await request(app)
        .post(VERIFY_REG_OTP)
        .send({ email, otp: '000000' })
        .expect(400);
      expect(finalRes.body.error.message).toContain('Too many failed OTP attempts');

      // Record was removed
      const record = await OtpVerification.findOne({ email, purpose: 'customer_registration' });
      expect(record).toBeNull();
    });

    it('rejects mismatched confirmMpin or non-6-digit MPIN', async () => {
      const email = 'validate@example.com';
      await request(app).post(SEND_REG_OTP).send({ email }).expect(200);
      const otp = emailService.sentEmails[0]!.otp;
      const verifyRes = await request(app).post(VERIFY_REG_OTP).send({ email, otp }).expect(200);
      const { verificationToken } = verifyRes.body.data;

      // Mismatch
      const mismatch = await request(app)
        .post(SET_REG_PIN)
        .send({
          email,
          verificationToken,
          mpin: '123456',
          confirmMpin: '654321',
        })
        .expect(400);
      expect(mismatch.body.error.details[0].message).toContain('do not match');

      // Non-6-digit
      await request(app)
        .post(SET_REG_PIN)
        .send({
          email,
          verificationToken,
          mpin: '12345',
          confirmMpin: '12345',
        })
        .expect(400);
    });
  });

  describe('Login Flow', () => {
    it('authenticates customer with email + MPIN and issues tokens', async () => {
      await createTestCustomer({ email: 'login@example.com', mpin: '112233' });

      const res = await request(app)
        .post(LOGIN)
        .send({ email: 'login@example.com', mpin: '112233' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toEqual(expect.any(String));
      expect(res.body.data.refreshToken).toEqual(expect.any(String));
      expect(res.body.data.customer).toMatchObject({
        email: 'login@example.com',
        role: 'customer',
      });
      expect(JSON.stringify(res.body.data)).not.toContain('mpinHash');
    });

    it('returns specific error for wrong MPIN with remaining attempts', async () => {
      await createTestCustomer({ email: 'login@example.com', mpin: '112233' });

      const res = await request(app)
        .post(LOGIN)
        .send({ email: 'login@example.com', mpin: '999999' })
        .expect(401);

      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(res.body.error.message).toContain('Incorrect MPIN');
      expect(res.body.error.message).toContain('attempt(s) remaining');
    });

    it('returns specific error for unknown email', async () => {
      const res = await request(app)
        .post(LOGIN)
        .send({ email: 'nobody@example.com', mpin: '112233' })
        .expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.message).toContain('No account found');
    });

    it('returns specific error for deactivated account', async () => {
      await createTestCustomer({ email: 'deactivated@example.com', mpin: '112233' });
      await Customer.updateOne({ email: 'deactivated@example.com' }, { isActive: false });

      const res = await request(app)
        .post(LOGIN)
        .send({ email: 'deactivated@example.com', mpin: '112233' })
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('deactivated');
    });

    it('returns specific error for unverified email', async () => {
      await createTestCustomer({ email: 'unverified@example.com', mpin: '112233' });
      await Customer.updateOne({ email: 'unverified@example.com' }, { isEmailVerified: false });

      const res = await request(app)
        .post(LOGIN)
        .send({ email: 'unverified@example.com', mpin: '112233' })
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('email is not verified');
    });

    it('locks account after 5 consecutive failed login attempts', async () => {
      const email = 'lockout@example.com';
      await createTestCustomer({ email, mpin: '123456' });

      // First 4 attempts show remaining count
      for (let i = 1; i <= 4; i++) {
        const res = await request(app)
          .post(LOGIN)
          .send({ email, mpin: '000000' })
          .expect(401);
        expect(res.body.error.message).toContain(`${5 - i} attempt(s) remaining`);
      }

      // 5th attempt triggers immediate lockout
      const lockRes = await request(app)
        .post(LOGIN)
        .send({ email, mpin: '000000' })
        .expect(403);
      expect(lockRes.body.error.code).toBe('FORBIDDEN');
      expect(lockRes.body.error.message).toContain('Account is temporarily locked');

      // Even from a fresh IP / app instance, login is blocked with 403 FORBIDDEN.
      const freshApp = createApp();
      const lockedRes = await request(freshApp)
        .post(LOGIN)
        .send({ email, mpin: '123456' })
        .expect(403);

      expect(lockedRes.body.error.code).toBe('FORBIDDEN');
      expect(lockedRes.body.error.message).toContain('Account is temporarily locked');
    });
  });

  describe('Forgot / Reset MPIN Flow', () => {
    it('resets MPIN and invalidates previous sessions', async () => {
      const email = 'reset@example.com';
      await createTestCustomer({ email, mpin: '111111' });

      // Create an active login session
      const { refreshToken } = await loginCustomerAs(app, email, '111111');
      expect(await RefreshSession.countDocuments()).toBe(1);

      // Request reset OTP
      await request(app).post(SEND_FORGOT_OTP).send({ email }).expect(200);
      const otp = emailService.sentEmails[0]!.otp;

      // Verify OTP
      const verifyRes = await request(app).post(VERIFY_FORGOT_OTP).send({ email, otp }).expect(200);

      const { verificationToken } = verifyRes.body.data;

      // Reset MPIN
      const resetRes = await request(app)
        .post(RESET_PIN)
        .send({
          email,
          verificationToken,
          mpin: '999999',
          confirmMpin: '999999',
        })
        .expect(200);

      expect(resetRes.body.success).toBe(true);

      // Previous session should be revoked
      expect(await RefreshSession.countDocuments()).toBe(0);

      // Old refresh token must fail
      await request(app).post(REFRESH).send({ refreshToken }).expect(401);

      // Old MPIN must fail
      await request(app).post(LOGIN).send({ email, mpin: '111111' }).expect(401);

      // New MPIN succeeds
      await request(app).post(LOGIN).send({ email, mpin: '999999' }).expect(200);
    });
  });

  describe('Session Management & RBAC', () => {
    it('refreshes token and rotates refresh token', async () => {
      await createTestCustomer({ email: 'session@example.com' });
      const { refreshToken: oldRefreshToken } = await loginCustomerAs(app, 'session@example.com');

      const refreshRes = await request(app)
        .post(REFRESH)
        .send({ refreshToken: oldRefreshToken })
        .expect(200);

      expect(refreshRes.body.data.accessToken).toEqual(expect.any(String));
      const newRefreshToken = refreshRes.body.data.refreshToken;
      expect(newRefreshToken).not.toBe(oldRefreshToken);

      // Old refresh token is single-use and now invalid
      await request(app).post(REFRESH).send({ refreshToken: oldRefreshToken }).expect(401);
    });

    it('logs out customer and revokes refresh session', async () => {
      await createTestCustomer({ email: 'logout@example.com' });
      const { refreshToken } = await loginCustomerAs(app, 'logout@example.com');
      expect(await RefreshSession.countDocuments()).toBe(1);

      await request(app).post(LOGOUT).send({ refreshToken }).expect(200);
      expect(await RefreshSession.countDocuments()).toBe(0);
    });

    it('returns customer profile on GET /me and rejects unauthenticated requests', async () => {
      await createTestCustomer({ email: 'profile@example.com' });
      const { accessToken } = await loginCustomerAs(app, 'profile@example.com');

      const res = await request(app)
        .get(ME)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data).toMatchObject({
        email: 'profile@example.com',
        role: 'customer',
      });

      await request(app).get(ME).expect(401);
    });

    it('ensures customer tokens cannot access admin routes (cryptographic separation)', async () => {
      await createTestCustomer({ email: 'customer-not-admin@example.com' });
      const { accessToken } = await loginCustomerAs(app, 'customer-not-admin@example.com');

      // Try calling admin dashboard endpoint
      await request(app)
        .get('/api/v1/admin/dashboard/stats')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });
  });
});
