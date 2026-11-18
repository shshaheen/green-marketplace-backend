import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { ApiError, type ErrorDetail } from '../utils/ApiError.js';

interface ValidationSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/**
 * Validates request parts against Zod schemas.
 * The parsed body replaces `req.body`; parsed query and params are stored on
 * `req.validated` because Express 5 exposes `req.query` as a read-only getter.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, _res, next) => {
    const details: ErrorDetail[] = [];
    const validated: NonNullable<typeof req.validated> = {};

    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;

      const result = schema.safeParse(part === 'body' ? (req.body ?? {}) : req[part]);
      if (!result.success) {
        for (const issue of result.error.issues) {
          details.push({ field: [part, ...issue.path].join('.'), message: issue.message });
        }
        continue;
      }

      if (part === 'body') req.body = result.data;
      else validated[part] = result.data;
    }

    if (details.length) return next(ApiError.validation(details));
    req.validated = validated;
    next();
  };
}
