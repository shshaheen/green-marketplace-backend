import { createHash, randomBytes, randomInt } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { isValidObjectId } from 'mongoose';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';

const ISSUER = 'green-marketplace-api';
export const AUDIENCE_ADMIN = 'green-marketplace-admin';
export const AUDIENCE_CUSTOMER = 'green-marketplace-customer';
const ALGORITHM = 'HS256';

export type UserRole = 'admin' | 'customer';

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  typ: 'access';
}

export function signAccessToken(userId: string, role: UserRole = 'admin'): string {
  const audience = role === 'admin' ? AUDIENCE_ADMIN : AUDIENCE_CUSTOMER;
  return jwt.sign({ typ: 'access', role }, env.JWT_ACCESS_SECRET, {
    subject: userId,
    algorithm: ALGORITHM,
    expiresIn: env.JWT_ACCESS_TTL_SECONDS,
    issuer: ISSUER,
    audience,
  });
}

export function verifyAccessToken(
  token: string,
  expectedRole: UserRole = 'admin',
): AccessTokenPayload {
  const audience = expectedRole === 'admin' ? AUDIENCE_ADMIN : AUDIENCE_CUSTOMER;
  let decoded: string | jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: [ALGORITHM],
      issuer: ISSUER,
      audience,
    });
  } catch {
    throw ApiError.unauthorized('Invalid or expired access token');
  }

  if (
    typeof decoded !== 'object' ||
    decoded.typ !== 'access' ||
    decoded.role !== expectedRole ||
    typeof decoded.sub !== 'string' ||
    !isValidObjectId(decoded.sub)
  ) {
    throw ApiError.unauthorized('Invalid or expired access token');
  }

  return { sub: decoded.sub, role: expectedRole, typ: 'access' };
}

/** Opaque, high-entropy refresh token. Only its hash is ever stored. */
export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function refreshTokenExpiry(from = new Date()): Date {
  return new Date(from.getTime() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/** Generates a secure random 6-digit OTP code. */
export function generateOtp(): string {
  return randomInt(100000, 1000000).toString();
}

/** Computes SHA-256 hash of an OTP. */
export function hashOtp(otp: string): string {
  return createHash('sha256').update(otp).digest('hex');
}

/** Generates an opaque verification token for multi-step flows. */
export function generateVerificationToken(): string {
  return randomBytes(32).toString('hex');
}

/** Hashes a verification token with SHA-256. */
export function hashVerificationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
