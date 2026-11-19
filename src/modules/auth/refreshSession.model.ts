import { model, Schema, type InferSchemaType } from 'mongoose';

/** One row per logged-in device (admin or customer). Only a SHA-256 hash of the refresh token is stored. */
const refreshSessionSchema = new Schema(
  {
    userType: { type: String, enum: ['admin', 'customer'], default: 'admin', required: true },
    userId: { type: Schema.Types.ObjectId, index: true },
    admin: { type: Schema.Types.ObjectId, ref: 'Admin', default: null, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    userAgent: { type: String, maxlength: 512 },
    ip: { type: String, maxlength: 64 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// MongoDB removes expired sessions automatically.
refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RefreshSessionAttrs = InferSchemaType<typeof refreshSessionSchema>;

export const RefreshSession = model('RefreshSession', refreshSessionSchema);
