import { env } from '../../config/env.js';
import { ApiError, ErrorCode } from '../../utils/ApiError.js';
import { Admin, toPublicAdmin, type PublicAdmin } from '../admin/admin.model.js';
import type { LoginResult, RequestMeta, TokenPair } from './auth.types.js';
import { verifyAgainstDummy, verifyPassword } from './password.js';
import { RefreshSession } from './refreshSession.model.js';
import {
  generateRefreshToken,
  hashToken,
  refreshTokenExpiry,
  signAccessToken,
} from './token.service.js';

const invalidCredentials = () =>
  new ApiError(401, ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password');

const invalidRefreshToken = () => ApiError.unauthorized('Invalid or expired refresh token');

async function issueTokens(adminId: string, meta: RequestMeta): Promise<TokenPair> {
  const refreshToken = generateRefreshToken();
  const refreshTokenExpiresAt = refreshTokenExpiry();

  await RefreshSession.create({
    admin: adminId,
    tokenHash: hashToken(refreshToken),
    expiresAt: refreshTokenExpiresAt,
    userAgent: meta.userAgent?.slice(0, 512),
    ip: meta.ip?.slice(0, 64),
  });

  return {
    accessToken: signAccessToken(adminId),
    accessTokenExpiresIn: env.JWT_ACCESS_TTL_SECONDS,
    refreshToken,
    refreshTokenExpiresAt,
  };
}

export async function login(
  email: string,
  password: string,
  meta: RequestMeta,
): Promise<LoginResult> {
  const admin = await Admin.findOne({ email }).select('+passwordHash');

  // Same error and similar timing for unknown email, wrong password and inactive account.
  const passwordOk = admin
    ? await verifyPassword(password, admin.passwordHash)
    : await verifyAgainstDummy(password);
  if (!admin || !passwordOk || !admin.isActive) throw invalidCredentials();

  admin.lastLoginAt = new Date();
  await admin.save();

  const tokens = await issueTokens(admin.id, meta);
  return { ...tokens, admin: toPublicAdmin(admin) };
}

/**
 * Exchanges a refresh token for a new token pair. The old token is deleted
 * atomically, so each refresh token can be used at most once.
 */
export async function refresh(refreshToken: string, meta: RequestMeta): Promise<TokenPair> {
  const session = await RefreshSession.findOneAndDelete({
    tokenHash: hashToken(refreshToken),
    expiresAt: { $gt: new Date() },
  }).lean();
  if (!session) throw invalidRefreshToken();

  const admin = await Admin.findById(session.admin).select('isActive').lean();
  if (!admin?.isActive) throw invalidRefreshToken();

  return issueTokens(admin._id.toString(), meta);
}

/** Revokes a refresh token. Succeeds even if the token is unknown, so logout is idempotent. */
export async function logout(refreshToken: string): Promise<void> {
  await RefreshSession.deleteOne({ tokenHash: hashToken(refreshToken) });
}

export async function getCurrentAdmin(adminId: string): Promise<PublicAdmin> {
  const admin = await Admin.findById(adminId).lean();
  if (!admin?.isActive) throw ApiError.unauthorized();
  return toPublicAdmin(admin);
}
