import { Router } from 'express';
import { createAuthRouter } from '../modules/auth/auth.routes.js';

/** Mounted at /api/v1. Public routes live at the root, admin routes under /admin. */
export function createApiRouter(): Router {
  const router = Router();

  router.use('/admin/auth', createAuthRouter());

  return router;
}
