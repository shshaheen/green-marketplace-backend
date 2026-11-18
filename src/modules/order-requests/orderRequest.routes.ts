import { Router } from 'express';
import {
  createCustomerActionLimiter,
  createSubmitLimiter,
  createTrackLookupLimiter,
} from '../../middlewares/rateLimiters.js';
import { validate } from '../../middlewares/validate.js';
import { idParamsSchema } from '../../utils/validators.js';
import * as orderRequestController from './orderRequest.controller.js';
import {
  adminListOrderRequestsQuerySchema,
  cancelOrderRequestSchema,
  cancelParamsSchema,
  submitOrderRequestSchema,
  trackByReferenceSchema,
  trackParamsSchema,
  updateAdminNotesSchema,
  updateStatusSchema,
} from './orderRequest.validation.js';

/** Mounted at /api/v1/order-requests. Customers have no accounts. */
export function createCustomerOrderRequestRouter(): Router {
  const router = Router();

  router.post(
    '/',
    createSubmitLimiter(),
    validate({ body: submitOrderRequestSchema }),
    orderRequestController.submit,
  );
  router.get(
    '/track/:token',
    createCustomerActionLimiter(),
    validate({ params: trackParamsSchema }),
    orderRequestController.trackByToken,
  );
  router.post(
    '/track',
    createTrackLookupLimiter(),
    validate({ body: trackByReferenceSchema }),
    orderRequestController.trackByReference,
  );
  router.post(
    '/:referenceNumber/cancel',
    createCustomerActionLimiter(),
    validate({ params: cancelParamsSchema, body: cancelOrderRequestSchema }),
    orderRequestController.cancel,
  );

  return router;
}

/** Mounted at /api/v1/admin/order-requests, behind `authenticate`. */
export function createAdminOrderRequestRouter(): Router {
  const router = Router();

  router.get(
    '/',
    validate({ query: adminListOrderRequestsQuerySchema }),
    orderRequestController.list,
  );
  router.get('/:id', validate({ params: idParamsSchema }), orderRequestController.getById);
  router.patch(
    '/:id/status',
    validate({ params: idParamsSchema, body: updateStatusSchema }),
    orderRequestController.updateStatus,
  );
  router.patch(
    '/:id/notes',
    validate({ params: idParamsSchema, body: updateAdminNotesSchema }),
    orderRequestController.updateNotes,
  );

  return router;
}
