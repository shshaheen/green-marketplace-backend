import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { createAuthRouter } from '../modules/auth/auth.routes.js';
import {
  createAdminCategoryRouter,
  createPublicCategoryRouter,
} from '../modules/category/category.routes.js';

/** Mounted at /api/v1. Public routes live at the root, admin routes under /admin. */
export function createApiRouter(): Router {
  const router = Router();

  // Public
  router.use('/categories', createPublicCategoryRouter());

  // Admin (auth endpoints handle their own authentication)
  router.use('/admin/auth', createAuthRouter());
  router.use('/admin/categories', authenticate, createAdminCategoryRouter());

  return router;
}
