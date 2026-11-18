import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';
import { objectIdSchema, searchQuerySchema } from '../../utils/validators.js';
import {
  INTENDED_USES,
  MAX_ITEMS_PER_REQUEST,
  MAX_QTY_PER_ITEM,
  ORDER_REQUEST_STATUSES,
  REFERENCE_NUMBER_PATTERN,
} from './orderRequest.constants.js';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .default(null);

/** 10-digit Indian mobile number; "+91" / "91" / "0" prefixes, spaces and dashes are removed. */
const phone = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, ''))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'));

/** YYYY-MM-DD, today or later (server date). */
const deliveryDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .transform((value) => new Date(`${value}T00:00:00.000Z`))
  .refine((date) => !Number.isNaN(date.getTime()), 'Enter a valid date')
  .refine((date) => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return date >= today;
  }, 'Preferred delivery date cannot be in the past');

export const submitOrderRequestSchema = z.strictObject({
  customerDetails: z.strictObject({
    name: z.string().trim().min(1, 'Name is required').max(100),
    phone,
    email: z
      .string()
      .trim()
      .toLowerCase()
      .transform((value) => value || null)
      .pipe(z.email('Enter a valid email address').max(254).nullable())
      .nullable()
      .default(null),
    location: z.string().trim().min(1, 'Location is required').max(200),
    pincode: z
      .string()
      .trim()
      .regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit pincode'),
  }),
  items: z
    .array(
      z.strictObject({
        plantId: objectIdSchema,
        quantity: z.number().int('Quantity must be a whole number').min(1).max(MAX_QTY_PER_ITEM),
      }),
    )
    .min(1, 'Add at least one plant')
    .max(MAX_ITEMS_PER_REQUEST)
    .refine(
      (items) => new Set(items.map((item) => item.plantId)).size === items.length,
      'Each plant can be added only once',
    ),
  intendedUse: z.enum(INTENDED_USES, 'Choose an intended use'),
  preferredDeliveryDate: deliveryDate.nullable().default(null),
  additionalNotes: optionalText(1000),
});

/** 32 random bytes, base64url: 43 characters. */
const trackingToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid tracking token');

const referenceNumber = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(z.string().regex(REFERENCE_NUMBER_PATTERN, 'Invalid reference number'));

export const trackParamsSchema = z.strictObject({ token: trackingToken });

/** Fallback when the app has lost its tracking token (e.g. after a reinstall). Read-only. */
export const trackByReferenceSchema = z.strictObject({ referenceNumber, phone });

export const cancelParamsSchema = z.strictObject({ referenceNumber });

/** The tracking token proves the caller owns the request (customers have no accounts). */
export const cancelOrderRequestSchema = z.strictObject({
  token: trackingToken,
  reason: optionalText(500),
});

export const updateStatusSchema = z.strictObject({
  status: z.enum(ORDER_REQUEST_STATUSES),
  /** Saved with this change in the status history, visible to admins only. */
  note: optionalText(1000),
});

export const updateAdminNotesSchema = z.strictObject({
  adminNotes: z
    .string()
    .trim()
    .max(5000)
    .transform((value) => value || null)
    .nullable(),
});

export const adminListOrderRequestsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(ORDER_REQUEST_STATUSES).optional(),
  /** Matches reference number, customer name or phone. */
  search: searchQuerySchema.optional(),
});

export type SubmitOrderRequestInput = z.infer<typeof submitOrderRequestSchema>;
export type CancelOrderRequestInput = z.infer<typeof cancelOrderRequestSchema>;
export type TrackByReferenceInput = z.infer<typeof trackByReferenceSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type UpdateAdminNotesInput = z.infer<typeof updateAdminNotesSchema>;
export type AdminListOrderRequestsQuery = z.infer<typeof adminListOrderRequestsQuerySchema>;
