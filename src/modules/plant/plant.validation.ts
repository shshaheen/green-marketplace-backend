import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';
import { booleanQuerySchema, objectIdSchema, searchQuerySchema } from '../../utils/validators.js';
import {
  AVAILABILITY,
  CURRENCY,
  HEIGHT_UNITS,
  MAX_IMAGES_PER_PLANT,
  MAX_PRICE_PAISE,
  PRICE_UNITS,
  SUNLIGHT,
} from './plant.constants.js';

const paise = z.number().int('Amount must be whole paise').min(0).max(MAX_PRICE_PAISE);

const name = z.string().trim().min(1, 'Name is required').max(120);
const description = z.string().trim().max(5000);
const price = z.strictObject({
  amount: paise,
  currency: z.literal(CURRENCY).default(CURRENCY),
});
const priceUnit = z.enum(PRICE_UNITS);
const minOrderQty = z.number().int().min(1).max(100_000);
const availability = z.enum(AVAILABILITY);

const attributes = z.strictObject({
  height: z
    .strictObject({
      min: z.number().min(0).max(10_000),
      max: z.number().min(0).max(10_000),
      unit: z.enum(HEIGHT_UNITS),
    })
    .refine((h) => h.min <= h.max, { message: 'min cannot be greater than max', path: ['min'] })
    .nullable()
    .default(null),
  sunlight: z.enum(SUNLIGHT).nullable().default(null),
  watering: z.string().trim().min(1).max(300).nullable().default(null),
});

export const createPlantSchema = z.strictObject({
  name,
  description: description.default(''),
  category: objectIdSchema,
  subcategory: objectIdSchema.nullable().default(null),
  price,
  priceUnit,
  minOrderQty: minOrderQty.default(1),
  availability: availability.default('in_stock'),
  attributes: attributes.default({ height: null, sunlight: null, watering: null }),
  isActive: z.boolean().default(true),
});

/**
 * Partial update. `attributes` replaces the whole attributes object when sent.
 * Visibility changes go through the status endpoint, images through the image endpoints.
 */
export const updatePlantSchema = z
  .strictObject({
    name: name.optional(),
    description: description.optional(),
    category: objectIdSchema.optional(),
    subcategory: objectIdSchema.nullable().optional(),
    price: price.optional(),
    priceUnit: priceUnit.optional(),
    minOrderQty: minOrderQty.optional(),
    availability: availability.optional(),
    attributes: attributes.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update');

export const plantStatusSchema = z.strictObject({ isActive: z.boolean() });

export const reorderImagesSchema = z.strictObject({
  /** Every image id of the plant, in the new order. The first becomes the main image. */
  imageIds: z.array(objectIdSchema).min(1).max(MAX_IMAGES_PER_PLANT),
});

export const imageParamsSchema = z.strictObject({ id: objectIdSchema, imageId: objectIdSchema });

export const PLANT_SORTS = ['-createdAt', 'createdAt', 'price', '-price', 'name', '-name'] as const;

const listFilters = paginationQuerySchema.extend({
  category: objectIdSchema.optional(),
  subcategory: objectIdSchema.optional(),
  search: searchQuerySchema.optional(),
  availability: availability.optional(),
  minPrice: z.coerce.number().pipe(paise).optional(),
  maxPrice: z.coerce.number().pipe(paise).optional(),
  sort: z.enum(PLANT_SORTS).default('-createdAt'),
});

const priceRangeIsValid = (q: { minPrice?: number | undefined; maxPrice?: number | undefined }) =>
  q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice;
const priceRangeError = { message: 'minPrice cannot be greater than maxPrice', path: ['minPrice'] };

export const publicListPlantsQuerySchema = listFilters.refine(priceRangeIsValid, priceRangeError);

export const adminListPlantsQuerySchema = listFilters
  .extend({
    isActive: booleanQuerySchema.optional(),
    includeDeleted: booleanQuerySchema.default(false),
  })
  .refine(priceRangeIsValid, priceRangeError);

export const plantIdOrSlugParamsSchema = z.strictObject({
  idOrSlug: z.string().trim().min(1).max(120),
});

export type CreatePlantInput = z.infer<typeof createPlantSchema>;
export type UpdatePlantInput = z.infer<typeof updatePlantSchema>;
export type PlantAttributesInput = z.infer<typeof attributes>;
export type PublicListPlantsQuery = z.infer<typeof publicListPlantsQuerySchema>;
export type AdminListPlantsQuery = z.infer<typeof adminListPlantsQuerySchema>;
export type PlantSort = (typeof PLANT_SORTS)[number];
