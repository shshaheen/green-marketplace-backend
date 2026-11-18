import { model, Schema, type InferSchemaType, type Types } from 'mongoose';
import { AVAILABILITY, CURRENCY, PRICE_UNITS } from '../plant/plant.constants.js';
import { INTENDED_USES, ORDER_REQUEST_STATUSES, STATUS_ACTORS } from './orderRequest.constants.js';

/**
 * Plant details are copied when the request is submitted so the request stays
 * accurate after the catalogue changes or the plant is deleted.
 */
const itemSchema = new Schema(
  {
    plantId: { type: Schema.Types.ObjectId, ref: 'Plant', required: true },
    plantNameSnapshot: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unit: { type: String, enum: PRICE_UNITS, required: true },
    // Indicative only; the final price is agreed offline.
    indicativePriceSnapshot: {
      type: new Schema(
        {
          amount: { type: Number, required: true, min: 0 }, // whole paise
          currency: { type: String, enum: [CURRENCY], default: CURRENCY, required: true },
        },
        { _id: false },
      ),
      required: true,
    },
    imageUrlSnapshot: { type: String, default: null },
    /** Availability when submitted; out-of-stock plants may still be requested. */
    availabilitySnapshot: { type: String, enum: AVAILABILITY, required: true },
  },
  { _id: false },
);

const statusChangeSchema = new Schema(
  {
    from: { type: String, enum: ORDER_REQUEST_STATUSES, default: null },
    to: { type: String, enum: ORDER_REQUEST_STATUSES, required: true },
    by: { type: String, enum: STATUS_ACTORS, required: true },
    adminId: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
    note: { type: String, default: null },
    at: { type: Date, required: true },
  },
  { _id: false },
);

const orderRequestSchema = new Schema(
  {
    referenceNumber: { type: String, required: true, unique: true },
    /** SHA-256 of the tracking token. The token itself is never stored. */
    trackingTokenHash: { type: String, required: true, unique: true, select: false },

    customerDetails: {
      type: new Schema(
        {
          name: { type: String, required: true, trim: true, maxlength: 100 },
          phone: { type: String, required: true },
          email: { type: String, default: null },
          location: { type: String, required: true, trim: true, maxlength: 200 },
          pincode: { type: String, required: true },
        },
        { _id: false },
      ),
      required: true,
    },

    items: { type: [itemSchema], required: true },
    intendedUse: { type: String, enum: INTENDED_USES, required: true },
    preferredDeliveryDate: { type: Date, default: null },
    additionalNotes: { type: String, default: null },

    status: { type: String, enum: ORDER_REQUEST_STATUSES, default: 'submitted', required: true },
    /** Internal notes, shown to admins only. */
    adminNotes: { type: String, default: null },
    statusHistory: { type: [statusChangeSchema], default: [] },
  },
  { timestamps: true, collection: 'order_requests' },
);

orderRequestSchema.index({ status: 1, createdAt: -1 });
orderRequestSchema.index({ createdAt: -1 });
orderRequestSchema.index({ 'customerDetails.phone': 1 });

export type OrderRequestAttrs = InferSchemaType<typeof orderRequestSchema>;
export type OrderRequestRecord = OrderRequestAttrs & { _id: Types.ObjectId };

export const OrderRequest = model('OrderRequest', orderRequestSchema);

/** One counter per year for reference numbers (`_id` = year). */
const referenceCounterSchema = new Schema(
  {
    _id: { type: Number, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { collection: 'order_request_counters', versionKey: false },
);

export const OrderRequestCounter = model('OrderRequestCounter', referenceCounterSchema);
