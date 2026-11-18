import type { Request } from 'express';
import { ipKeyGenerator, rateLimit, type Options } from 'express-rate-limit';
import { ErrorCode } from '../utils/ApiError.js';
import { sendError } from '../utils/apiResponse.js';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

const tooManyRequests: Options['handler'] = (_req, res) => {
  sendError(res, 429, ErrorCode.TOO_MANY_REQUESTS, 'Too many requests, please try again later');
};

function clientIp(req: Request): string {
  return ipKeyGenerator(req.ip ?? 'unknown');
}

/**
 * Rate limiters are created per app instance so each instance (and each test)
 * gets its own in-memory store.
 */

/** Broad limit for every API request. */
export function createApiLimiter() {
  return rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit: 600,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: clientIp,
    handler: tooManyRequests,
  });
}

/** Failed admin logins, keyed by IP + email. Successful logins are not counted. */
export function createLoginLimiter() {
  return rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit: 5,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => {
      const rawEmail: unknown = req.body?.email;
      const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase().slice(0, 254) : '';
      return `${clientIp(req)}:${email}`;
    },
    handler: tooManyRequests,
  });
}
