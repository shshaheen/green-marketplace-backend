import { z } from 'zod';

export const emailField = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const ADMIN_PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const createAdminSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  email: emailField,
  password: z
    .string()
    .min(
      ADMIN_PASSWORD_MIN_LENGTH,
      `Password must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters`,
    )
    .max(PASSWORD_MAX_LENGTH),
});

export type CreateAdminInput = z.infer<typeof createAdminSchema>;
