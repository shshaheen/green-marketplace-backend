import { env } from '../../config/env.js';
import { ApiError, ErrorCode } from '../../utils/ApiError.js';
import { Admin, toPublicAdmin, type PublicAdmin } from '../admin/admin.model.js';
import type { LoginResult, RequestMeta, TokenPair } from './auth.types.js';
import type { SetPinInput } from './auth.validation.js';
import { consumeVerificationToken, generateAndSendOtp, verifyOtpCode } from './otp.service.js';
import { hashPassword, verifyAgainstDummy, verifyPassword } from './password.js';
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
    userType: 'admin',
    userId: adminId,
    admin: adminId,
    tokenHash: hashToken(refreshToken),
    expiresAt: refreshTokenExpiresAt,
    userAgent: meta.userAgent?.slice(0, 512),
    ip: meta.ip?.slice(0, 64),
  });

  return {
    accessToken: signAccessToken(adminId, 'admin'),
    accessTokenExpiresIn: env.JWT_ACCESS_TTL_SECONDS,
    refreshToken,
    refreshTokenExpiresAt,
  };
}

export interface AdminLoginCredentials {
  email: string;
  mpin?: string;
  password?: string;
}

export async function login(
  emailOrCredentials: string | AdminLoginCredentials,
  passwordOrMeta?: string | RequestMeta,
  maybeMeta?: RequestMeta,
): Promise<LoginResult> {
  let email: string;
  let mpin: string | undefined;
  let password: string | undefined;
  let meta: RequestMeta;

  if (typeof emailOrCredentials === 'object') {
    email = emailOrCredentials.email;
    mpin = emailOrCredentials.mpin;
    password = emailOrCredentials.password;
    meta = (passwordOrMeta as RequestMeta) ?? {};
  } else {
    email = emailOrCredentials;
    if (typeof passwordOrMeta === 'string') {
      password = passwordOrMeta;
    }
    meta = maybeMeta ?? {};
  }

  const admin = await Admin.findOne({ email }).select('+passwordHash +mpinHash');

  const now = new Date();
  if (admin?.lockoutUntil && admin.lockoutUntil > now) {
    const minutesRemaining = Math.max(
      1,
      Math.ceil((admin.lockoutUntil.getTime() - now.getTime()) / (60 * 1000)),
    );
    throw new ApiError(
      403,
      ErrorCode.FORBIDDEN,
      `Account is temporarily locked due to repeated failed login attempts. Please try again in ${minutesRemaining} minute(s) or reset your MPIN.`,
    );
  }

  let isMatch: boolean;

  if (mpin) {
    if (admin && !admin.mpinHash) {
      throw new ApiError(
        400,
        ErrorCode.BAD_REQUEST,
        'Initial MPIN setup required. Please complete initial MPIN setup before logging in.',
      );
    }
    isMatch = admin?.mpinHash
      ? await verifyPassword(mpin, admin.mpinHash)
      : await verifyAgainstDummy(mpin);
  } else if (password) {
    isMatch = admin?.passwordHash
      ? await verifyPassword(password, admin.passwordHash)
      : await verifyAgainstDummy(password);
  } else {
    throw invalidCredentials();
  }

  if (!admin || !isMatch || !admin.isActive) {
    if (admin && admin.isActive) {
      admin.failedLoginAttempts = (admin.failedLoginAttempts || 0) + 1;
      if (admin.failedLoginAttempts >= env.MAX_FAILED_LOGIN_ATTEMPTS) {
        admin.lockoutUntil = new Date(now.getTime() + env.LOCKOUT_DURATION_MINUTES * 60 * 1000);
        admin.failedLoginAttempts = 0;
      }
      await admin.save();
    }
    throw invalidCredentials();
  }

  admin.failedLoginAttempts = 0;
  admin.lockoutUntil = null;
  admin.lastLoginAt = new Date();
  await admin.save();

  const tokens = await issueTokens(admin.id, meta);
  return { ...tokens, admin: toPublicAdmin(admin) };
}

export async function sendAdminInitialPinOtp(
  email: string,
): Promise<{ message: string; cooldownSeconds: number }> {
  const admin = await Admin.findOne({ email }).select('+mpinHash');
  if (!admin || !admin.isActive) {
    throw ApiError.notFound('No active administrator account found with this email.');
  }

  if (admin.mpinHash) {
    throw ApiError.badRequest(
      'MPIN is already set for this account. Please use forgot MPIN to reset.',
    );
  }

  const { cooldownSeconds } = await generateAndSendOtp({
    email,
    purpose: 'admin_initial_pin',
    userType: 'admin',
  });

  return {
    message: 'Initial setup verification code sent to your email.',
    cooldownSeconds,
  };
}

export async function verifyAdminInitialPinOtp(
  email: string,
  otp: string,
): Promise<{ message: string; verificationToken: string }> {
  const admin = await Admin.findOne({ email }).select('+mpinHash');
  if (!admin || !admin.isActive) {
    throw ApiError.notFound('No active administrator account found with this email.');
  }

  if (admin.mpinHash) {
    throw ApiError.badRequest(
      'MPIN is already set for this account. Please use forgot MPIN to reset.',
    );
  }

  const { verificationToken } = await verifyOtpCode({
    email,
    otp,
    purpose: 'admin_initial_pin',
  });

  return {
    message: 'Verification successful. You can now set your administrator MPIN.',
    verificationToken,
  };
}

export async function setAdminInitialPin(
  input: SetPinInput,
  meta: RequestMeta,
): Promise<LoginResult> {
  await consumeVerificationToken({
    email: input.email,
    purpose: 'admin_initial_pin',
    verificationToken: input.verificationToken,
  });

  const admin = await Admin.findOne({ email: input.email }).select('+mpinHash');
  if (!admin || !admin.isActive) {
    throw ApiError.notFound('Administrator account not found.');
  }

  if (admin.mpinHash) {
    throw ApiError.badRequest('MPIN is already set for this account.');
  }

  admin.mpinHash = await hashPassword(input.mpin);
  admin.isInitialPinSet = true;
  admin.failedLoginAttempts = 0;
  admin.lockoutUntil = null;
  admin.lastLoginAt = new Date();
  await admin.save();

  const tokens = await issueTokens(admin.id, meta);
  return { ...tokens, admin: toPublicAdmin(admin) };
}

export async function sendAdminForgotPinOtp(
  email: string,
): Promise<{ message: string; cooldownSeconds: number }> {
  const admin = await Admin.findOne({ email }).lean();
  if (!admin || !admin.isActive) {
    throw ApiError.notFound('No active administrator account found with this email.');
  }

  const { cooldownSeconds } = await generateAndSendOtp({
    email,
    purpose: 'admin_reset_pin',
    userType: 'admin',
  });

  return {
    message: 'Reset verification code sent to your email.',
    cooldownSeconds,
  };
}

export async function verifyAdminForgotPinOtp(
  email: string,
  otp: string,
): Promise<{ message: string; verificationToken: string }> {
  const { verificationToken } = await verifyOtpCode({
    email,
    otp,
    purpose: 'admin_reset_pin',
  });

  return {
    message: 'Verification successful. You can now reset your administrator MPIN.',
    verificationToken,
  };
}

export async function resetAdminPin(input: SetPinInput): Promise<{ message: string }> {
  await consumeVerificationToken({
    email: input.email,
    purpose: 'admin_reset_pin',
    verificationToken: input.verificationToken,
  });

  const admin = await Admin.findOne({ email: input.email });
  if (!admin || !admin.isActive) {
    throw ApiError.notFound('Administrator account not found.');
  }

  admin.mpinHash = await hashPassword(input.mpin);
  admin.isInitialPinSet = true;
  admin.failedLoginAttempts = 0;
  admin.lockoutUntil = null;
  await admin.save();

  // Invalidate all active admin refresh sessions
  await RefreshSession.deleteMany({
    $or: [{ admin: admin._id }, { userId: admin._id }],
  });

  return { message: 'Administrator MPIN reset successfully. Please log in with your new MPIN.' };
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

  const adminId = session.admin ?? session.userId;
  const admin = await Admin.findById(adminId).select('isActive').lean();
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
