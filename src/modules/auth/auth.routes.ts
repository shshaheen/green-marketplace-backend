import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import {
  createLoginLimiter,
  createOtpSendLimiter,
  createOtpVerifyLimiter,
  createPinActionLimiter,
} from '../../middlewares/rateLimiters.js';
import { validate } from '../../middlewares/validate.js';
import * as authController from './auth.controller.js';
import {
  adminLoginSchema,
  refreshTokenSchema,
  sendOtpSchema,
  setPinSchema,
  verifyOtpSchema,
} from './auth.validation.js';

/** Mounted at /api/v1/auth/admin and aliased at /api/v1/admin/auth */
export function createAuthRouter(): Router {
  const router = Router();

  // Admin login (supports MPIN or password)
  router.post(
    '/login',
    createLoginLimiter(),
    validate({ body: adminLoginSchema }),
    authController.login,
  );

  // Admin Initial MPIN Setup
  router.post(
    '/initial-pin/send-otp',
    createOtpSendLimiter(),
    validate({ body: sendOtpSchema }),
    authController.sendInitialPinOtp,
  );
  router.post(
    '/initial-pin/verify-otp',
    createOtpVerifyLimiter(),
    validate({ body: verifyOtpSchema }),
    authController.verifyInitialPinOtp,
  );
  router.post(
    '/initial-pin/set-pin',
    createPinActionLimiter(),
    validate({ body: setPinSchema }),
    authController.setInitialPin,
  );

  // Admin Forgot / Reset MPIN
  router.post(
    '/forgot-pin/send-otp',
    createOtpSendLimiter(),
    validate({ body: sendOtpSchema }),
    authController.sendForgotPinOtp,
  );
  router.post(
    '/forgot-pin/verify-otp',
    createOtpVerifyLimiter(),
    validate({ body: verifyOtpSchema }),
    authController.verifyForgotPinOtp,
  );
  router.post(
    '/forgot-pin/reset',
    createPinActionLimiter(),
    validate({ body: setPinSchema }),
    authController.resetPin,
  );

  // Session management
  router.post('/refresh', validate({ body: refreshTokenSchema }), authController.refresh);
  router.post('/logout', validate({ body: refreshTokenSchema }), authController.logout);
  router.get('/me', authenticate, authController.me);

  return router;
}

export const createAdminAuthRouter = createAuthRouter;
