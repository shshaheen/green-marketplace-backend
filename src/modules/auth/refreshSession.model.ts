import { model, Schema, type InferSchemaType } from 'mongoose';

/** One row per logged-in admin device. Only a SHA-256 hash of the refresh token is stored. */
const refreshSessionSchema = new Schema(
  {
    admin: { type: Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
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
