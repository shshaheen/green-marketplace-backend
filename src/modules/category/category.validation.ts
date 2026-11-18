import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';
import { booleanQuerySchema, objectIdSchema, searchQuerySchema } from '../../utils/validators.js';

const name = z.string().trim().min(1, 'Name is required').max(80);
const description = z.string().trim().max(500);
const parent = objectIdSchema.nullable();
const sortOrder = z.number().int().min(0).max(10_000);

export const createCategorySchema = z.strictObject({
  name,
  description: description.default(''),
  parent: parent.default(null),
  sortOrder: sortOrder.default(0),
  isActive: z.boolean().default(true),
});

// Written out separately (not `.partial()`) so missing fields stay untouched
// instead of being reset to their create-time defaults.
export const updateCategorySchema = z
  .strictObject({
    name: name.optional(),
    description: description.optional(),
    parent: parent.optional(),
    sortOrder: sortOrder.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update');

export const listCategoriesQuerySchema = paginationQuerySchema.extend({
  /** A category id for its subcategories, or "root" for top-level categories. */
  parent: z.union([z.literal('root'), objectIdSchema]).optional(),
  isActive: booleanQuerySchema.optional(),
  includeDeleted: booleanQuerySchema.default(false),
  search: searchQuerySchema.optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;
