import { z } from 'zod';
import { emailField, PASSWORD_MAX_LENGTH } from '../admin/admin.validation.js';

export const mpinField = z.string().regex(/^\d{6}$/, 'MPIN must be exactly 6 digits');
export const otpField = z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits');

export const sendOtpSchema = z.strictObject({
  email: emailField,
});

export const verifyOtpSchema = z.strictObject({
  email: emailField,
  otp: otpField,
});

export const setPinSchema = z
  .strictObject({
    email: emailField,
    verificationToken: z.string().min(32).max(128),
    mpin: mpinField,
    confirmMpin: mpinField,
  })
  .refine((data) => data.mpin === data.confirmMpin, {
    message: 'MPIN and confirmation MPIN do not match',
    path: ['confirmMpin'],
  });

export const customerLoginSchema = z.strictObject({
  email: emailField,
  mpin: mpinField,
});

/**
 * Admin login supports email + MPIN as primary, and keeps password support
 * for backward compatibility and initial seeding.
 */
export const adminLoginSchema = z
  .strictObject({
    email: emailField,
    mpin: mpinField.optional(),
    password: z.string().min(1).max(PASSWORD_MAX_LENGTH).optional(),
  })
  .refine((data) => Boolean(data.mpin || data.password), {
    message: 'Either MPIN or password is required',
    path: ['mpin'],
  });

// Kept for backward compatibility with existing admin login calls
export const loginSchema = adminLoginSchema;

export const refreshTokenSchema = z.strictObject({
  refreshToken: z.string().min(20).max(200),
});

export type SendOtpInput = z.infer<typeof sendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type SetPinInput = z.infer<typeof setPinSchema>;
export type CustomerLoginInput = z.infer<typeof customerLoginSchema>;
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type LoginInput = AdminLoginInput;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
