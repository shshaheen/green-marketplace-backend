import { model, Schema, type InferSchemaType, type Types } from 'mongoose';
import {
  AVAILABILITY,
  CURRENCY,
  HEIGHT_UNITS,
  MAX_IMAGES_PER_PLANT,
  PRICE_UNITS,
  SUNLIGHT,
} from './plant.constants.js';

const imageSchema = new Schema({
  url: { type: String, required: true },
  publicId: { type: String, required: true },
  width: { type: Number },
  height: { type: Number },
});

const plantSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true },
    description: { type: String, trim: true, maxlength: 5000, default: '' },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    subcategory: { type: Schema.Types.ObjectId, ref: 'Category', default: null },

    // Indicative price only; the final price is negotiated offline.
    price: {
      type: new Schema(
        {
          amount: { type: Number, required: true, min: 0 }, // whole paise
          currency: { type: String, enum: [CURRENCY], default: CURRENCY, required: true },
        },
        { _id: false },
      ),
      required: true,
    },
    priceUnit: { type: String, enum: PRICE_UNITS, required: true },
    minOrderQty: { type: Number, required: true, min: 1, default: 1 },
    availability: { type: String, enum: AVAILABILITY, default: 'in_stock' },

    /** The first image is the main one. */
    images: {
      type: [imageSchema],
      default: [],
      validate: {
        validator: (images: unknown[]) => images.length <= MAX_IMAGES_PER_PLANT,
        message: `A plant can have at most ${MAX_IMAGES_PER_PLANT} images`,
      },
    },

    attributes: {
      height: {
        type: new Schema(
          {
            min: { type: Number, required: true, min: 0 },
            max: { type: Number, required: true, min: 0 },
            unit: { type: String, enum: HEIGHT_UNITS, required: true },
          },
          { _id: false },
        ),
        default: null,
      },
      sunlight: { type: String, enum: SUNLIGHT, default: null },
      watering: { type: String, trim: true, maxlength: 300, default: null },
    },

    isActive: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true },
);

plantSchema.index({ deletedAt: 1, isActive: 1, category: 1, subcategory: 1 });
plantSchema.index({ 'price.amount': 1 });
plantSchema.index({ createdAt: -1 });

export type PlantAttrs = InferSchemaType<typeof plantSchema>;
export type PlantRecord = PlantAttrs & { _id: Types.ObjectId };

export const Plant = model('Plant', plantSchema);
