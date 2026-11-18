import { model, Schema, type InferSchemaType, type Types } from 'mongoose';

/**
 * Categories and subcategories share one collection. A top-level category has
 * `parent: null`; a subcategory points at a top-level category. Nesting is
 * limited to these two levels by the service layer.
 */
const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    parent: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true },
);

categorySchema.index({ parent: 1, deletedAt: 1, sortOrder: 1, name: 1 });

export type CategoryAttrs = InferSchemaType<typeof categorySchema>;
export type CategoryRecord = CategoryAttrs & { _id: Types.ObjectId };

export const Category = model('Category', categorySchema);
