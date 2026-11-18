import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { isValidObjectId } from 'mongoose';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';

const ISSUER = 'green-marketplace-api';
const AUDIENCE = 'green-marketplace-admin';
const ALGORITHM = 'HS256';

export interface AccessTokenPayload {
  sub: string;
  typ: 'access';
}

export function signAccessToken(adminId: string): string {
  return jwt.sign({ typ: 'access' }, env.JWT_ACCESS_SECRET, {
    subject: adminId,
    algorithm: ALGORITHM,
    expiresIn: env.JWT_ACCESS_TTL_SECONDS,
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  let decoded: string | jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: [ALGORITHM],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
  } catch {
    throw ApiError.unauthorized('Invalid or expired access token');
  }

  if (
    typeof decoded !== 'object' ||
    decoded.typ !== 'access' ||
    typeof decoded.sub !== 'string' ||
    !isValidObjectId(decoded.sub)
  ) {
    throw ApiError.unauthorized('Invalid or expired access token');
  }

  return { sub: decoded.sub, typ: 'access' };
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
