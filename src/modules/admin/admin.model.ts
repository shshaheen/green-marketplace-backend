import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

const adminSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
  },
);

export type AdminAttrs = InferSchemaType<typeof adminSchema>;
export type AdminDocument = HydratedDocument<AdminAttrs>;

export const Admin = model('Admin', adminSchema);

/** The admin fields that are safe to return to clients. */
export interface PublicAdmin {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export function toPublicAdmin(admin: {
  _id: { toString(): string };
  name: string;
  email: string;
  isActive: boolean;
  lastLoginAt?: Date | null;
  createdAt: Date;
}): PublicAdmin {
  return {
    id: admin._id.toString(),
    name: admin.name,
    email: admin.email,
    isActive: admin.isActive,
    lastLoginAt: admin.lastLoginAt ?? null,
    createdAt: admin.createdAt,
  };
}
