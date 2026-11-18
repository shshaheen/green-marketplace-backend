import type { Response } from 'express';
import type { ErrorCode, ErrorDetail } from './ApiError.js';
import type { PaginationMeta } from './pagination.js';

export interface SuccessBody<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ErrorBody {
  success: false;
  error: { code: ErrorCode; message: string; details?: ErrorDetail[] };
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  options: { status?: number; meta?: PaginationMeta } = {},
): void {
  const body: SuccessBody<T> = { success: true, data };
  if (options.meta) body.meta = options.meta;
  res.status(options.status ?? 200).json(body);
}

export function sendError(
  res: Response,
  status: number,
  code: ErrorCode,
  message: string,
  details?: ErrorDetail[],
): void {
  const body: ErrorBody = { success: false, error: { code, message } };
  if (details?.length) body.error.details = details;
  res.status(status).json(body);
}
