import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),

    BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),

    // Image storage. Required in production; optional elsewhere so the API and tests
    // can run without Cloudinary (image uploads then return 503).
    CLOUDINARY_CLOUD_NAME: z.string().trim().optional(),
    CLOUDINARY_API_KEY: z.string().trim().optional(),
    CLOUDINARY_API_SECRET: z.string().trim().optional(),
    CLOUDINARY_FOLDER: z.string().trim().min(1).default('green-marketplace'),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== 'production') return;
    for (const key of [
      'CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_API_KEY',
      'CLOUDINARY_API_SECRET',
    ] as const) {
      if (!value[key])
        ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required in production` });
    }
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return parsed.data;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
