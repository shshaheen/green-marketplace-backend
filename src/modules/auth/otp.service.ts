import { env } from '../../config/env.js';
import { ApiError, ErrorCode } from '../../utils/ApiError.js';
import { getEmailService } from '../email/email.service.js';
import { OtpVerification, type OtpPurpose } from './otpVerification.model.js';
import {
  generateOtp,
  generateVerificationToken,
  hashOtp,
  hashVerificationToken,
} from './token.service.js';

interface RequestOtpOptions {
  email: string;
  purpose: OtpPurpose;
  userType: 'customer' | 'admin';
}

export async function generateAndSendOtp({
  email,
  purpose,
  userType,
}: RequestOtpOptions): Promise<{ cooldownSeconds: number }> {
  const now = new Date();

  // Enforce resend cooldown
  const existing = await OtpVerification.findOne({ email, purpose });
  if (existing && existing.resendAvailableAt > now) {
    const secondsRemaining = Math.max(
      1,
      Math.ceil((existing.resendAvailableAt.getTime() - now.getTime()) / 1000),
    );
    throw new ApiError(
      429,
      ErrorCode.TOO_MANY_REQUESTS,
      `Please wait ${secondsRemaining} second(s) before requesting a new OTP`,
    );
  }

  const otp = generateOtp();
  const otpHash = hashOtp(otp);
  const expiresAt = new Date(now.getTime() + env.OTP_EXPIRY_MINUTES * 60 * 1000);
  const resendAvailableAt = new Date(now.getTime() + env.OTP_RESEND_COOLDOWN_SECONDS * 1000);

  // Deliver email first; if provider fails, do not record or state success
  await getEmailService().sendOtpEmail({
    to: email,
    otp,
    purpose,
    expiryMinutes: env.OTP_EXPIRY_MINUTES,
  });

  await OtpVerification.findOneAndUpdate(
    { email, purpose },
    {
      otpHash,
      userType,
      attempts: 0,
      isVerified: false,
      verificationTokenHash: null,
      expiresAt,
      resendAvailableAt,
    },
    { upsert: true, new: true },
  );

  return { cooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS };
}

interface VerifyOtpOptions {
  email: string;
  otp: string;
  purpose: OtpPurpose;
}

export async function verifyOtpCode({
  email,
  otp,
  purpose,
}: VerifyOtpOptions): Promise<{ verificationToken: string }> {
  const record = await OtpVerification.findOne({ email, purpose });
  const now = new Date();

  if (!record || record.expiresAt <= now) {
    throw ApiError.badRequest('Invalid or expired OTP');
  }

  if (record.attempts >= env.OTP_MAX_ATTEMPTS) {
    await record.deleteOne();
    throw ApiError.badRequest('Too many failed OTP attempts. Please request a new OTP.');
  }

  const candidateHash = hashOtp(otp);
  if (record.otpHash !== candidateHash) {
    record.attempts += 1;
    await record.save();

    const remaining = env.OTP_MAX_ATTEMPTS - record.attempts;
    if (remaining <= 0) {
      await record.deleteOne();
      throw ApiError.badRequest('Too many failed OTP attempts. Please request a new OTP.');
    }
    throw ApiError.badRequest(`Invalid OTP. ${remaining} attempt(s) remaining.`);
  }

  const verificationToken = generateVerificationToken();
  record.isVerified = true;
  record.verificationTokenHash = hashVerificationToken(verificationToken);
  // Allow 15 minutes to finish setting the MPIN
  record.expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
  await record.save();

  return { verificationToken };
}

interface ConsumeTokenOptions {
  email: string;
  purpose: OtpPurpose;
  verificationToken: string;
}

export async function consumeVerificationToken({
  email,
  purpose,
  verificationToken,
}: ConsumeTokenOptions): Promise<void> {
  const tokenHash = hashVerificationToken(verificationToken);
  const record = await OtpVerification.findOneAndDelete({
    email,
    purpose,
    verificationTokenHash: tokenHash,
    isVerified: true,
    expiresAt: { $gt: new Date() },
  });

  if (!record) {
    throw ApiError.badRequest(
      'Invalid or expired verification session. Please verify your email again.',
    );
  }
}
