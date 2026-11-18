import type { Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authenticate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import * as orderRequestService from './orderRequest.service.js';
import type {
  AdminListOrderRequestsQuery,
  CancelOrderRequestInput,
  SubmitOrderRequestInput,
  TrackByReferenceInput,
  UpdateAdminNotesInput,
  UpdateStatusInput,
} from './orderRequest.validation.js';

function params<T>(req: Request): T {
  return req.validated?.params as T;
}

// Customer

export async function submit(req: Request, res: Response): Promise<void> {
  const created = await orderRequestService.submitOrderRequest(req.body as SubmitOrderRequestInput);
  sendSuccess(res, created, { status: 201 });
}

export async function trackByToken(req: Request, res: Response): Promise<void> {
  const { token } = params<{ token: string }>(req);
  sendSuccess(res, await orderRequestService.trackByToken(token));
}

export async function trackByReference(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await orderRequestService.trackByReference(req.body as TrackByReferenceInput));
}

export async function cancel(req: Request, res: Response): Promise<void> {
  const { referenceNumber } = params<{ referenceNumber: string }>(req);
  const { token, reason } = req.body as CancelOrderRequestInput;
  sendSuccess(res, await orderRequestService.cancelByCustomer(referenceNumber, token, reason));
}

// Admin

export async function list(req: Request, res: Response): Promise<void> {
  const { items, meta } = await orderRequestService.listOrderRequests(
    req.validated?.query as AdminListOrderRequestsQuery,
  );
  sendSuccess(res, items, { meta });
}

export async function getById(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await orderRequestService.getOrderRequest(params<{ id: string }>(req).id));
}

export async function updateStatus(req: Request, res: Response): Promise<void> {
  const admin = requireAdmin(req);
  const { id } = params<{ id: string }>(req);
  const { status, note } = req.body as UpdateStatusInput;
  sendSuccess(res, await orderRequestService.updateStatus(id, status, note, admin.id));
}

export async function updateNotes(req: Request, res: Response): Promise<void> {
  const { id } = params<{ id: string }>(req);
  const { adminNotes } = req.body as UpdateAdminNotesInput;
  sendSuccess(res, await orderRequestService.updateAdminNotes(id, adminNotes));
}
