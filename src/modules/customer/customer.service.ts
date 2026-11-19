import { env } from '../../config/env.js';
import { ApiError, ErrorCode } from '../../utils/ApiError.js';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '../auth/password.js';
import { RefreshSession } from '../auth/refreshSession.model.js';
import {
  generateRefreshToken,
  hashToken,
  refreshTokenExpiry,
  signAccessToken,
} from '../auth/token.service.js';
import type { CustomerLoginResult, RequestMeta, TokenPair } from '../auth/auth.types.js';
import type { SetPinInput } from '../auth/auth.validation.js';
import {
  consumeVerificationToken,
  generateAndSendOtp,
  verifyOtpCode,
} from '../auth/otp.service.js';
import { Customer, toPublicCustomer, type PublicCustomer } from './customer.model.js';

const invalidCredentials = () =>
  new ApiError(401, ErrorCode.INVALID_CREDENTIALS, 'Invalid email or MPIN');

const invalidRefreshToken = () => ApiError.unauthorized('Invalid or expired refresh token');

async function issueTokens(customerId: string, meta: RequestMeta): Promise<TokenPair> {
  const refreshToken = generateRefreshToken();
  const refreshTokenExpiresAt = refreshTokenExpiry();

  await RefreshSession.create({
    userType: 'customer',
    userId: customerId,
    customer: customerId,
    tokenHash: hashToken(refreshToken),
    expiresAt: refreshTokenExpiresAt,
    userAgent: meta.userAgent?.slice(0, 512),
    ip: meta.ip?.slice(0, 64),
  });

  return {
    accessToken: signAccessToken(customerId, 'customer'),
    accessTokenExpiresIn: env.JWT_ACCESS_TTL_SECONDS,
    refreshToken,
    refreshTokenExpiresAt,
  };
}

export async function sendRegistrationOtp(
  email: string,
): Promise<{ message: string; email: string; cooldownSeconds: number }> {
  const existing = await Customer.exists({ email });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists. Please log in.');
  }

  const { cooldownSeconds } = await generateAndSendOtp({
    email,
    purpose: 'customer_registration',
    userType: 'customer',
  });

  return {
    message: 'Verification code sent to your email.',
    email,
    cooldownSeconds,
  };
}

export async function verifyRegistrationOtp(
  email: string,
  otp: string,
): Promise<{ message: string; verificationToken: string }> {
  const existing = await Customer.exists({ email });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists. Please log in.');
  }

  const { verificationToken } = await verifyOtpCode({
    email,
    otp,
    purpose: 'customer_registration',
  });

  return {
    message: 'Email verified successfully. Please set your 6-digit MPIN.',
    verificationToken,
  };
}

export async function completeRegistration(
  input: SetPinInput,
  meta: RequestMeta,
): Promise<CustomerLoginResult> {
  await consumeVerificationToken({
    email: input.email,
    purpose: 'customer_registration',
    verificationToken: input.verificationToken,
  });

  if (await Customer.exists({ email: input.email })) {
    throw ApiError.conflict('An account with this email already exists. Please log in.');
  }

  const mpinHash = await hashPassword(input.mpin);
  const customer = await Customer.create({
    email: input.email,
    mpinHash,
    role: 'customer',
    isEmailVerified: true,
    isActive: true,
    lastLoginAt: new Date(),
  });

  const tokens = await issueTokens(customer.id, meta);
  return { ...tokens, customer: toPublicCustomer(customer) };
}

export async function loginCustomer(
  email: string,
  mpin: string,
  meta: RequestMeta,
): Promise<CustomerLoginResult> {
  const customer = await Customer.findOne({ email }).select('+mpinHash');

  const now = new Date();
  if (customer?.lockoutUntil && customer.lockoutUntil > now) {
    const minutesRemaining = Math.max(
      1,
      Math.ceil((customer.lockoutUntil.getTime() - now.getTime()) / (60 * 1000)),
    );
    throw new ApiError(
      403,
      ErrorCode.FORBIDDEN,
      `Account is temporarily locked due to repeated failed login attempts. Please try again in ${minutesRemaining} minute(s) or reset your MPIN.`,
    );
  }

  const mpinOk = customer
    ? await verifyPassword(mpin, customer.mpinHash)
    : await verifyAgainstDummy(mpin);

  if (!customer || !mpinOk || !customer.isActive) {
    if (customer && customer.isActive) {
      customer.failedLoginAttempts += 1;
      if (customer.failedLoginAttempts >= env.MAX_FAILED_LOGIN_ATTEMPTS) {
        customer.lockoutUntil = new Date(now.getTime() + env.LOCKOUT_DURATION_MINUTES * 60 * 1000);
        customer.failedLoginAttempts = 0;
      }
      await customer.save();
    }
    throw invalidCredentials();
  }

  customer.failedLoginAttempts = 0;
  customer.lockoutUntil = null;
  customer.lastLoginAt = new Date();
  await customer.save();

  const tokens = await issueTokens(customer.id, meta);
  return { ...tokens, customer: toPublicCustomer(customer) };
}

export async function sendForgotPinOtp(
  email: string,
): Promise<{ message: string; cooldownSeconds: number }> {
  const customer = await Customer.findOne({ email }).lean();
  if (!customer || !customer.isActive) {
    throw ApiError.notFound('No active customer account found with this email.');
  }

  const { cooldownSeconds } = await generateAndSendOtp({
    email,
    purpose: 'customer_reset_pin',
    userType: 'customer',
  });

  return {
    message: 'Reset verification code sent to your email.',
    cooldownSeconds,
  };
}

export async function verifyForgotPinOtp(
  email: string,
  otp: string,
): Promise<{ message: string; verificationToken: string }> {
  const { verificationToken } = await verifyOtpCode({
    email,
    otp,
    purpose: 'customer_reset_pin',
  });

  return {
    message: 'Verification successful. You can now set a new MPIN.',
    verificationToken,
  };
}

export async function resetCustomerPin(input: SetPinInput): Promise<{ message: string }> {
  await consumeVerificationToken({
    email: input.email,
    purpose: 'customer_reset_pin',
    verificationToken: input.verificationToken,
  });

  const customer = await Customer.findOne({ email: input.email });
  if (!customer || !customer.isActive) {
    throw ApiError.notFound('Customer account not found.');
  }

  customer.mpinHash = await hashPassword(input.mpin);
  customer.failedLoginAttempts = 0;
  customer.lockoutUntil = null;
  await customer.save();

  // Invalidate all active refresh sessions
  await RefreshSession.deleteMany({ customer: customer._id });

  return { message: 'MPIN reset successfully. Please log in with your new MPIN.' };
}

export async function refreshCustomerToken(
  refreshToken: string,
  meta: RequestMeta,
): Promise<TokenPair> {
  const session = await RefreshSession.findOneAndDelete({
    tokenHash: hashToken(refreshToken),
    userType: 'customer',
    expiresAt: { $gt: new Date() },
  }).lean();
  if (!session) throw invalidRefreshToken();

  const customerId = session.customer ?? session.userId;
  const customer = await Customer.findById(customerId).select('isActive').lean();
  if (!customer?.isActive) throw invalidRefreshToken();

  return issueTokens(customer._id.toString(), meta);
}

export async function logoutCustomer(refreshToken: string): Promise<void> {
  await RefreshSession.deleteOne({ tokenHash: hashToken(refreshToken) });
}

export async function getCurrentCustomer(customerId: string): Promise<PublicCustomer> {
  const customer = await Customer.findById(customerId).lean();
  if (!customer || !customer.isActive) throw ApiError.unauthorized();
  return toPublicCustomer(customer);
}
