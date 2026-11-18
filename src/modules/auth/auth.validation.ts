import { z } from 'zod';
import { emailField, PASSWORD_MAX_LENGTH } from '../admin/admin.validation.js';

export const loginSchema = z.strictObject({
  email: emailField,
  // No length rule beyond the max here: login must not reveal the password policy.
  password: z.string().min(1, 'Password is required').max(PASSWORD_MAX_LENGTH),
});

export const refreshTokenSchema = z.strictObject({
  refreshToken: z.string().min(20).max(200),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
