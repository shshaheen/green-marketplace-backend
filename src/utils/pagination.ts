import { z } from 'zod';

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

/** Reusable query-string fields for paginated list endpoints. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function getSkip({ page, limit }: PaginationQuery): number {
  return (page - 1) * limit;
}

export function buildPaginationMeta(
  { page, limit }: PaginationQuery,
  total: number,
): PaginationMeta {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}
