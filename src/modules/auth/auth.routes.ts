import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { createLoginLimiter } from '../../middlewares/rateLimiters.js';
import { validate } from '../../middlewares/validate.js';
import * as authController from './auth.controller.js';
import { loginSchema, refreshTokenSchema } from './auth.validation.js';

/** Mounted at /api/v1/admin/auth */
export function createAuthRouter(): Router {
  const router = Router();

  router.post(
    '/login',
    createLoginLimiter(),
    validate({ body: loginSchema }),
    authController.login,
  );
  router.post('/refresh', validate({ body: refreshTokenSchema }), authController.refresh);
  router.post('/logout', validate({ body: refreshTokenSchema }), authController.logout);
  router.get('/me', authenticate, authController.me);

  return router;
}
