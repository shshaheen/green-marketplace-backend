import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { createAuthRouter } from '../modules/auth/auth.routes.js';
import { createCustomerAuthRouter } from '../modules/customer/customer.routes.js';
import {
  createAdminCategoryRouter,
  createPublicCategoryRouter,
} from '../modules/category/category.routes.js';
import { createAdminDashboardRouter } from '../modules/dashboard/dashboard.routes.js';
import {
  createAdminOrderRequestRouter,
  createCustomerOrderRequestRouter,
} from '../modules/order-requests/orderRequest.routes.js';
import { createAdminPlantRouter, createPublicPlantRouter } from '../modules/plant/plant.routes.js';

/** Mounted at /api/v1. Public routes live at the root, admin routes under /admin. */
export function createApiRouter(): Router {
  const router = Router();

  // Public / customer catalogue & order requests
  router.use('/categories', createPublicCategoryRouter());
  router.use('/plants', createPublicPlantRouter());
  router.use('/order-requests', createCustomerOrderRequestRouter());

  // Customer authentication
  router.use('/auth/customer', createCustomerAuthRouter());

  // Admin authentication (mounted at /auth/admin and aliased at /admin/auth for backward compatibility)
  router.use('/auth/admin', createAuthRouter());
  router.use('/admin/auth', createAuthRouter());

  // Protected admin routes
  router.use('/admin/categories', authenticate, createAdminCategoryRouter());
  router.use('/admin/plants', authenticate, createAdminPlantRouter());
  router.use('/admin/order-requests', authenticate, createAdminOrderRequestRouter());
  router.use('/admin/dashboard', authenticate, createAdminDashboardRouter());

  return router;
}
