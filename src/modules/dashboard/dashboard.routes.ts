import { Router } from 'express';
import * as dashboardController from './dashboard.controller.js';

/** Mounted at /api/v1/admin/dashboard, behind `authenticate`. */
export function createAdminDashboardRouter(): Router {
  const router = Router();
  router.get('/stats', dashboardController.stats);
  return router;
}
