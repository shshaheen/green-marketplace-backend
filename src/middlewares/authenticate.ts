import type { Request, RequestHandler } from 'express';
import { verifyAccessToken } from '../modules/auth/token.service.js';
import { Admin } from '../modules/admin/admin.model.js';
import { Customer } from '../modules/customer/customer.model.js';
import type { AuthenticatedAdmin, AuthenticatedCustomer } from '../modules/auth/auth.types.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Requires a valid admin access token. The admin is re-loaded on every request
 * so deactivating an account takes effect immediately, not when the token expires.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw ApiError.unauthorized();

  const payload = verifyAccessToken(header.slice('Bearer '.length).trim(), 'admin');

  const admin = await Admin.findById(payload.sub).select('name email isActive').lean();
  if (!admin || !admin.isActive) throw ApiError.unauthorized();

  req.admin = { id: admin._id.toString(), name: admin.name, email: admin.email };
  next();
};

export const authenticateAdmin = authenticate;

/** Returns the authenticated admin; use only in handlers behind `authenticate`. */
export function requireAdmin(req: Request): AuthenticatedAdmin {
  if (!req.admin) throw ApiError.unauthorized();
  return req.admin;
}

/**
 * Requires a valid customer access token. Re-loads the customer to verify active status.
 */
export const authenticateCustomer: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw ApiError.unauthorized();

  const payload = verifyAccessToken(header.slice('Bearer '.length).trim(), 'customer');

  const customer = await Customer.findById(payload.sub).select('email isActive').lean();
  if (!customer || !customer.isActive) throw ApiError.unauthorized();

  req.customer = { id: customer._id.toString(), email: customer.email };
  next();
};

/** Returns the authenticated customer; use only in handlers behind `authenticateCustomer`. */
export function requireCustomer(req: Request): AuthenticatedCustomer {
  if (!req.customer) throw ApiError.unauthorized();
  return req.customer;
}
