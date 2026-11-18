import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { createAuthRouter } from '../modules/auth/auth.routes.js';
import {
  createAdminCategoryRouter,
  createPublicCategoryRouter,
} from '../modules/category/category.routes.js';
import {
  createAdminOrderRequestRouter,
  createCustomerOrderRequestRouter,
} from '../modules/order-requests/orderRequest.routes.js';
import { createAdminPlantRouter, createPublicPlantRouter } from '../modules/plant/plant.routes.js';

/** Mounted at /api/v1. Public routes live at the root, admin routes under /admin. */
export function createApiRouter(): Router {
  const router = Router();

  // Public / customer
  router.use('/categories', createPublicCategoryRouter());
  router.use('/plants', createPublicPlantRouter());
  router.use('/order-requests', createCustomerOrderRequestRouter());

  // Admin (auth endpoints handle their own authentication)
  router.use('/admin/auth', createAuthRouter());
  router.use('/admin/categories', authenticate, createAdminCategoryRouter());
  router.use('/admin/plants', authenticate, createAdminPlantRouter());
  router.use('/admin/order-requests', authenticate, createAdminOrderRequestRouter());

  return router;
}
