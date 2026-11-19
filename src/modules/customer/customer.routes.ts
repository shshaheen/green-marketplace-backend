import { Router } from 'express';
import { authenticateCustomer } from '../../middlewares/authenticate.js';
import {
  createLoginLimiter,
  createOtpSendLimiter,
  createOtpVerifyLimiter,
  createPinActionLimiter,
} from '../../middlewares/rateLimiters.js';
import { validate } from '../../middlewares/validate.js';
import {
  customerLoginSchema,
  refreshTokenSchema,
  sendOtpSchema,
  setPinSchema,
  verifyOtpSchema,
} from '../auth/auth.validation.js';
import * as customerController from './customer.controller.js';

/** Mounted at /api/v1/auth/customer */
export function createCustomerAuthRouter(): Router {
  const router = Router();

  // Registration flow
  router.post(
    '/register/send-otp',
    createOtpSendLimiter(),
    validate({ body: sendOtpSchema }),
    customerController.sendRegisterOtp,
  );
  router.post(
    '/register/verify-otp',
    createOtpVerifyLimiter(),
    validate({ body: verifyOtpSchema }),
    customerController.verifyRegisterOtp,
  );
  router.post(
    '/register/set-pin',
    createPinActionLimiter(),
    validate({ body: setPinSchema }),
    customerController.setRegisterPin,
  );

  // Login
  router.post(
    '/login',
    createLoginLimiter(),
    validate({ body: customerLoginSchema }),
    customerController.login,
  );

  // Forgot / Reset MPIN flow
  router.post(
    '/forgot-pin/send-otp',
    createOtpSendLimiter(),
    validate({ body: sendOtpSchema }),
    customerController.sendForgotPinOtp,
  );
  router.post(
    '/forgot-pin/verify-otp',
    createOtpVerifyLimiter(),
    validate({ body: verifyOtpSchema }),
    customerController.verifyForgotPinOtp,
  );
  router.post(
    '/forgot-pin/reset',
    createPinActionLimiter(),
    validate({ body: setPinSchema }),
    customerController.resetPin,
  );

  // Session management
  router.post('/refresh', validate({ body: refreshTokenSchema }), customerController.refresh);
  router.post('/logout', validate({ body: refreshTokenSchema }), customerController.logout);
  router.get('/me', authenticateCustomer, customerController.me);

  return router;
}
