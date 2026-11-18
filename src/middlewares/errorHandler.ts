import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { ApiError, ErrorCode } from '../utils/ApiError.js';
import { sendError } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route ${req.method} ${req.path} not found`));
};

function isBodyParserError(err: unknown): err is { type: string; status: number } {
  return typeof err === 'object' && err !== null && 'type' in err && 'status' in err;
}

function isDuplicateKeyError(err: unknown): err is { code: number; keyValue?: object } {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000;
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ApiError) {
    return sendError(res, err.statusCode, err.code, err.message, err.details);
  }

  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    return sendError(res, 400, ErrorCode.VALIDATION_ERROR, 'Request validation failed', details);
  }

  if (isBodyParserError(err)) {
    if (err.type === 'entity.parse.failed') {
      return sendError(res, 400, ErrorCode.BAD_REQUEST, 'Malformed JSON body');
    }
    if (err.type === 'entity.too.large') {
      return sendError(res, 413, ErrorCode.PAYLOAD_TOO_LARGE, 'Request body is too large');
    }
  }

  if (err instanceof mongoose.Error.CastError) {
    return sendError(res, 400, ErrorCode.BAD_REQUEST, `Invalid value for ${err.path}`);
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return sendError(res, 400, ErrorCode.VALIDATION_ERROR, 'Request validation failed', details);
  }

  if (isDuplicateKeyError(err)) {
    const field = Object.keys(err.keyValue ?? {})[0];
    return sendError(
      res,
      409,
      ErrorCode.CONFLICT,
      field ? `A record with this ${field} already exists` : 'Duplicate record',
    );
  }

  // Unexpected: log the full error server-side, never leak internals to the client.
  logger.error({ err, method: req.method, path: req.path }, 'Unhandled error');
  return sendError(res, 500, ErrorCode.INTERNAL_ERROR, 'Something went wrong');
};
