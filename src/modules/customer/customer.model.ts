import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

const customerSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    mpinHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['customer'], default: 'customer', required: true },
    isEmailVerified: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    failedLoginAttempts: { type: Number, default: 0 },
    lockoutUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.mpinHash;
        delete ret.__v;
        return ret;
      },
    },
  },
);

export type CustomerAttrs = InferSchemaType<typeof customerSchema>;
export type CustomerDocument = HydratedDocument<CustomerAttrs>;

export const Customer = model('Customer', customerSchema);

/** Safe fields to return to clients. */
export interface PublicCustomer {
  id: string;
  email: string;
  role: 'customer';
  isEmailVerified: boolean;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export function toPublicCustomer(customer: {
  _id: { toString(): string };
  email: string;
  role?: string;
  isEmailVerified?: boolean;
  isActive: boolean;
  lastLoginAt?: Date | null;
  createdAt: Date;
}): PublicCustomer {
  return {
    id: customer._id.toString(),
    email: customer.email,
    role: 'customer',
    isEmailVerified: customer.isEmailVerified ?? true,
    isActive: customer.isActive,
    lastLoginAt: customer.lastLoginAt ?? null,
    createdAt: customer.createdAt,
  };
}
