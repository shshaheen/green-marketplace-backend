import type { AuthenticatedAdmin } from '../modules/auth/auth.types.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by the `authenticate` middleware on admin routes. */
      admin?: AuthenticatedAdmin;
      /** Parsed query string and route params, set by the `validate` middleware. */
      validated?: { query?: unknown; params?: unknown };
    }
  }
}

export {};
