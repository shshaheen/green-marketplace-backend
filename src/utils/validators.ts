import { z } from 'zod';

/** A 24-character hex MongoDB ObjectId string. */
export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const idParamsSchema = z.strictObject({ id: objectIdSchema });

/** Query-string boolean: accepts only "true" or "false". */
export const booleanQuerySchema = z.enum(['true', 'false']).transform((value) => value === 'true');

/** Free-text search term from a query string. */
export const searchQuerySchema = z.string().trim().min(1).max(100);

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
